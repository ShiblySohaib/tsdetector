import googleapiclient.discovery
from langdetect import detect
import emoji
import pandas as pd
def extract_video_id(url):
    match = re.search(r"v=([a-zA-Z0-9_-]+)", url)
    return match.group(1) if match else None

def clean_text(text):
    text = re.sub(r"[,\'\"']", "", text)
    return text.replace("\n", " ")

def contains_emoji(text):
    return bool(emoji.emoji_list(text))

import re
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.sequence import pad_sequences
import pickle
from bnltk.tokenize import Tokenizers
from bnltk.stemmer import BanglaStemmer

# Load models
model = 'bilstm'
sentiment_model = load_model(f'models/{model}/sentiment_model.h5')
topic_model = load_model(f'models/{model}/topic_model.h5')

# Load tokenizer
with open(f'models/{model}/tokenizer.pkl', 'rb') as f:
    tokenizer = pickle.load(f)

# Load encoders
with open(f'models/{model}/topic_encoder.pkl', 'rb') as f:
    topic_encoder = pickle.load(f)
with open(f'models/{model}/sentiment_encoder.pkl', 'rb') as f:
    sentiment_encoder = pickle.load(f)

MAX_LEN = 100

tokenizer_bn = Tokenizers()
stemmer = BanglaStemmer()
def preprocess_bangla(text):
    text = re.sub(r"[^অ-হঀ-৺০-৯\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = tokenizer_bn.bn_word_tokenizer(text)
    stemmed_tokens = [stemmer.stem(token) for token in tokens if token.strip()]
    return " ".join(stemmed_tokens)



app = Flask(__name__)
CORS(app)

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    url = data.get('url', '')
    api_key = data.get('api_key', '')  # Optionally pass API key from frontend
    if not api_key:
        return jsonify({'error': 'API key required'}), 400
    youtube = googleapiclient.discovery.build(
        'youtube', 'v3', developerKey=api_key
    )
    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400
    filtered_comments = set()
    next_page_token = None
    while len(filtered_comments) < 500:
        request_y = youtube.commentThreads().list(
            part="snippet",
            videoId=video_id,
            maxResults=100,
            pageToken=next_page_token
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
    # Predict topic and sentiment for each comment
    processed = [preprocess_bangla(c) for c in comments]
    seqs = tokenizer.texts_to_sequences(processed)
    padded = pad_sequences(seqs, maxlen=MAX_LEN, padding='post')
    topic_preds = topic_model.predict(padded)
    sentiment_preds = sentiment_model.predict(padded)
    topic_labels = topic_encoder.inverse_transform(np.argmax(topic_preds, axis=1))
    sentiment_labels = sentiment_encoder.inverse_transform(np.argmax(sentiment_preds, axis=1))
    # Calculate percentages
    topic_counts = pd.Series(topic_labels).value_counts(normalize=True) * 100
    sentiment_counts = pd.Series(sentiment_labels).value_counts(normalize=True) * 100
    # Prepare detailed results for table
    detailed_results = [
        {'comment': c, 'topic': t, 'sentiment': s}
        for c, t, s in zip(comments, topic_labels, sentiment_labels)
    ]
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
    processed = preprocess_bangla(comment)
    seq = tokenizer.texts_to_sequences([processed])
    padded = pad_sequences(seq, maxlen=MAX_LEN, padding='post')
    topic_pred = topic_model.predict(padded)
    sentiment_pred = sentiment_model.predict(padded)
    topic = topic_encoder.inverse_transform([np.argmax(topic_pred)])[0]
    sentiment = sentiment_encoder.inverse_transform([np.argmax(sentiment_pred)])[0]
    return jsonify({'topic': topic, 'sentiment': sentiment})

if __name__ == '__main__':
    app.run(debug=True)
