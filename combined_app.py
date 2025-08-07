import re
import numpy as np
import pandas as pd
import pickle
import joblib
import emoji
from flask import Flask, request, jsonify
from flask_cors import CORS
from langdetect import detect
from bnltk.tokenize import Tokenizers
from bnltk.stemmer import BanglaStemmer
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.sequence import pad_sequences
import googleapiclient.discovery

# === Load Models ===
model_path = 'models/cnn-bilstm-svm2'

model_topic_cnn = load_model(f'{model_path}/model_topic_cnn.h5')
model_topic_lstm = load_model(f'{model_path}/model_topic_lstm.h5')
model_sentiment_cnn = load_model(f'{model_path}/model_sentiment_cnn.h5')
model_sentiment_lstm = load_model(f'{model_path}/model_sentiment_lstm.h5')

svm_topic_model = joblib.load(f'{model_path}/svm_topic_model.pkl')
svm_sentiment_model = joblib.load(f'{model_path}/svm_sentiment_model.pkl')

with open(f'{model_path}/tokenizer.pkl', 'rb') as f:
    tokenizer = pickle.load(f)

with open(f'{model_path}/topic_encoder.pkl', 'rb') as f:
    topic_encoder = pickle.load(f)
with open(f'{model_path}/sentiment_encoder.pkl', 'rb') as f:
    sentiment_encoder = pickle.load(f)

# === Constants ===
MAX_LEN = 100
tokenizer_bn = Tokenizers()
stemmer = BanglaStemmer()

# === Helper Functions ===
def extract_video_id(url):
    match = re.search(r"v=([a-zA-Z0-9_-]+)", url)
    return match.group(1) if match else None

def clean_text(text):
    text = re.sub(r"[,\'\"']", "", text)
    return text.replace("\n", " ")

def contains_emoji(text):
    return bool(emoji.emoji_list(text))

def preprocess_bangla(text):
    text = re.sub(r"[^অ-হঀ-৺০-৯\s]", " ", str(text))
    text = re.sub(r"\s+", " ", text).strip()
    tokens = tokenizer_bn.bn_word_tokenizer(text)
    stemmed_tokens = [stemmer.stem(token) for token in tokens if token.strip()]
    return " ".join(stemmed_tokens)

def predict_stacked(comment):
    processed = preprocess_bangla(comment)
    seq = tokenizer.texts_to_sequences([processed])
    padded = pad_sequences(seq, maxlen=MAX_LEN, padding='post')

    # Get probabilities from CNN and LSTM
    topic_probs_cnn = model_topic_cnn.predict(padded)
    topic_probs_lstm = model_topic_lstm.predict(padded)
    sentiment_probs_cnn = model_sentiment_cnn.predict(padded)
    sentiment_probs_lstm = model_sentiment_lstm.predict(padded)

    # Stack them
    topic_combined = np.hstack([topic_probs_cnn, topic_probs_lstm])
    sentiment_combined = np.hstack([sentiment_probs_cnn, sentiment_probs_lstm])

    # Final prediction using SVM
    topic_label = topic_encoder.inverse_transform(svm_topic_model.predict(topic_combined))[0]
    sentiment_label = sentiment_encoder.inverse_transform(svm_sentiment_model.predict(sentiment_combined))[0]

    return topic_label, sentiment_label

# === Flask App ===
app = Flask(__name__)
CORS(app)

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    url = data.get('url', '')
    api_key = data.get('api_key', '')
    if not api_key:
        return jsonify({'error': 'API key required'}), 400

    youtube = googleapiclient.discovery.build('youtube', 'v3', developerKey=api_key)
    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400

    filtered_comments = set()
    next_page_token = None
    while len(filtered_comments) < 500:
        request_y = youtube.commentThreads().list(
            part="snippet", videoId=video_id, maxResults=100, pageToken=next_page_token
        )
        response = request_y.execute()
        for item in response.get("items", []):
            comment = item["snippet"]["topLevelComment"]["snippet"]
            text = clean_text(comment["textOriginal"])
            try:
                if detect(text) == "bn" and not contains_emoji(text) and len(text) <= 250:
                    filtered_comments.add(text)
            except:
                continue
        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break

    comments = list(filtered_comments)[:500]
    if not comments:
        return jsonify({'error': 'No Bangla comments found'}), 404

    # Predict each comment
    detailed_results = []
    topic_results = []
    sentiment_results = []

    for comment in comments:
        topic, sentiment = predict_stacked(comment)
        detailed_results.append({'comment': comment, 'topic': topic, 'sentiment': sentiment})
        topic_results.append(topic)
        sentiment_results.append(sentiment)

    topic_counts = pd.Series(topic_results).value_counts(normalize=True) * 100
    sentiment_counts = pd.Series(sentiment_results).value_counts(normalize=True) * 100

    return jsonify({
        'topic_percentages': topic_counts.to_dict(),
        'sentiment_percentages': sentiment_counts.to_dict(),
        'total_comments': len(comments),
        'detailed_results': detailed_results
    })

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    comment = data.get('comment', '')
    topic, sentiment = predict_stacked(comment)
    return jsonify({'topic': topic, 'sentiment': sentiment})

if __name__ == '__main__':
    app.run(debug=True)
