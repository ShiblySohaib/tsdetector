// Single Comment Prediction
document.getElementById('predictBtn').addEventListener('click', async function() {
    const comment = document.getElementById('commentInput').value;
    const resultDiv = document.getElementById('singleResult');
    const topicSpan = document.getElementById('topicResult');
    const sentimentSpan = document.getElementById('sentimentResult');
    
    if (!comment.trim()) {
        alert('Please enter a comment');
        return;
    }
    
    // Show loading in the result area
    topicSpan.textContent = 'Loading...';
    sentimentSpan.textContent = '';
    resultDiv.style.display = 'block';
    
    try {
        const response = await fetch('http://127.0.0.1:5000/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment })
        });
        
        if (!response.ok) throw new Error('Server error');
        
        const data = await response.json();
        topicSpan.textContent = data.topic;
        sentimentSpan.textContent = data.sentiment;
        
    } catch (err) {
        topicSpan.textContent = 'Error: ' + err.message;
        sentimentSpan.textContent = '';
    }
});

// YouTube Video Analysis
document.getElementById('analyzeBtn').addEventListener('click', async function() {
    const url = document.getElementById('youtubeUrlInput').value;
    
    if (!url.trim()) {
        alert('Please enter a YouTube URL');
        return;
    }

    // Get API key from localStorage or prompt for it
    let apiKey = localStorage.getItem('yt_api_key');
    if (!apiKey) {
        apiKey = prompt('Enter your YouTube API key:');
        if (!apiKey) {
            alert('API key is required.');
            return;
        }
        localStorage.setItem('yt_api_key', apiKey);
    }

    // Show the results card and loading state
    const resultCard = document.getElementById('analysisResultCard');
    const loadingState = document.getElementById('loadingState');
    const resultsState = document.getElementById('resultsState');

    resultCard.style.display = 'block';
    loadingState.style.display = 'block';
    resultsState.style.display = 'none';

    try {
        const response = await fetch('http://127.0.0.1:5000/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, api_key: apiKey })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error');
        }

        const data = await response.json();

        // Color arrays must be declared before their first use
        const topicColors = [
            '#ff0000ff', '#ffe600ff', '#56adffff', '#5f5e00ff'
            , '#00ff15ff', '#9966FF', '#FF9F40', '#cc5200ff',
            '#643000ff', '#702577ff'
        ];
        const sentimentColors = [
            '#ff0000ff', '#ff7300ff', '#3f75e9ff', '#10d61aff', 
        ];

        // Hide loading, show results
        loadingState.style.display = 'none';
        resultsState.style.display = 'block';

        // Find the highest percentage topic and sentiment
        const topicEntries = Object.entries(data.topic_percentages)
            .filter(([topic, percentage]) => 
                topic.toLowerCase() !== 'threat' && topic.toLowerCase() !== 'abusive'
            )
            .sort((a, b) => b[1] - a[1]); // Sort by percentage descending

        let topTopicDisplay;
        if (topicEntries[0][0].toLowerCase() === 'others' && topicEntries.length > 1) {
            // If top topic is "others", show 2nd topic + others
            const secondTopic = topicEntries[1][0];
            topTopicDisplay = `${secondTopic.charAt(0).toUpperCase() + secondTopic.slice(1)} and Others`;
        } else {
            // Otherwise show the top topic with first letter capitalized
            const topTopic = topicEntries[0][0];
            topTopicDisplay = topTopic.charAt(0).toUpperCase() + topTopic.slice(1);
        }

        const topSentiment = Object.entries(data.sentiment_percentages)
            .reduce((a, b) => a[1] > b[1] ? a : b)[0];

        // Update summary
        document.getElementById('topTopicResult').textContent = topTopicDisplay;
        document.getElementById('topSentimentResult').textContent = topSentiment;

        // Populate advanced results (but keep them hidden)
        const topicDiv = document.getElementById('topicPercentages');
        const sentimentDiv = document.getElementById('sentimentPercentages');
        const censorableDiv = document.getElementById('censorableDiv');

        topicDiv.innerHTML = Object.entries(data.topic_percentages)
            .map(([topic, percentage], index) => 
                `<div class="percentage-item">
                    <span class="percentage-label">
                        <span class="color-indicator" style="background-color: ${topicColors[index % topicColors.length]}"></span>
                        ${topic}
                    </span>
                    <span class="percentage-value">${percentage.toFixed(1)}%</span>
                </div>`
            ).join('');

        sentimentDiv.innerHTML = Object.entries(data.sentiment_percentages)
            .map(([sentiment, percentage], index) => 
                `<div class="percentage-item">
                    <span class="percentage-label">
                        <span class="color-indicator" style="background-color: ${sentimentColors[index % sentimentColors.length]}"></span>
                        ${sentiment}
                    </span>
                    <span class="percentage-value">${percentage.toFixed(1)}%</span>
                </div>`
            ).join('');

        // Bar chart for threat, abusive, hate
        // Count threat, abusive, hate from detailed_results
        let threatCount = 0, abusiveCount = 0, hateCount = 0;
        if (data.detailed_results) {
            data.detailed_results.forEach(row => {
                if (row.topic && row.topic.toLowerCase() === 'threat') threatCount++;
                if (row.topic && row.topic.toLowerCase() === 'abusive') abusiveCount++;
                if (row.sentiment && row.sentiment.toLowerCase() === 'hate') hateCount++;
            });
        }
        // Render bar chart
        const barCanvas = document.getElementById('censorableBarChart');
        if (window.censorableBarChartInstance) {
            window.censorableBarChartInstance.destroy();
        }
        window.censorableBarChartInstance = new Chart(barCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Threat', 'Abusive', 'Hate'],
                datasets: [{
                    data: [threatCount, abusiveCount, hateCount],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.7)',
                        'rgba(255, 159, 64, 0.7)',
                        'rgba(54, 162, 235, 0.7)'
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(255, 159, 64, 1)',
                        'rgba(54, 162, 235, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: `Censorable Comments: ${data.censorable_results.count} (${data.censorable_results.percentage.toFixed(1)}%)` }
                },
                scales: {
                    y: { beginAtZero: true, precision: 0 }
                }
            }
        });

        // Create charts immediately with fixed dimensions
        createChartsWithFixedSize(data.topic_percentages, data.sentiment_percentages, topicColors, sentimentColors);

        // Populate detailed results table
        if (data.detailed_results) {
            const tbody = document.querySelector('#resultsTable tbody');
            tbody.innerHTML = '';
            data.detailed_results.forEach((row, idx) => {
            // Check if the row is censorable
            const topic = row.topic ? row.topic.toLowerCase() : '';
            const sentiment = row.sentiment ? row.sentiment.toLowerCase() : '';
            const isCensorable =
                (topic === 'threat' || topic === 'abusive') ||
                (sentiment === 'hate');
            const tr = document.createElement('tr');
            if (isCensorable) {
                tr.classList.add('censored-row');
            }
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td>${row.comment}</td>
                <td>${row.topic}</td>
                <td>${row.sentiment}</td>
            `;
            tbody.appendChild(tr);
            });
        }

    } catch (err) {
        loadingState.style.display = 'none';
        resultsState.innerHTML = `<div class="alert alert-danger">Analysis failed: ${err.message}</div>`;
        resultsState.style.display = 'block';
    }
});

// Advanced Results Toggle - Charts are pre-created, just show/hide
document.getElementById('advancedResultsBtn').addEventListener('click', function() {
    const advancedResults = document.getElementById('advancedResults');
    const icon = this.querySelector('.toggle-icon');
    
    if (advancedResults.classList.contains('show')) {
        advancedResults.classList.remove('show');
        this.setAttribute('aria-expanded', 'false');
    } else {
        advancedResults.classList.add('show');
        this.setAttribute('aria-expanded', 'true');
    }
});

// Function to create charts with fixed dimensions
function createChartsWithFixedSize(topicPercentages, sentimentPercentages, topicColors, sentimentColors) {
    // Set fixed canvas dimensions
    const topicCanvas = document.getElementById('topicChart');
    const sentimentCanvas = document.getElementById('sentimentChart');
    
    topicCanvas.width = 175;
    topicCanvas.height = 200;
    sentimentCanvas.width = 175;
    sentimentCanvas.height = 145;
    
    // Create topic pie chart
    const topicCtx = topicCanvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.topicChartInstance) {
        window.topicChartInstance.destroy();
    }

    window.topicChartInstance = new Chart(topicCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(topicPercentages),
            datasets: [{
                data: Object.values(topicPercentages),
                backgroundColor: topicColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: false, // Disable responsive to use fixed dimensions
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Create sentiment pie chart
    const sentimentCtx = sentimentCanvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.sentimentChartInstance) {
        window.sentimentChartInstance.destroy();
    }

    window.sentimentChartInstance = new Chart(sentimentCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(sentimentPercentages),
            datasets: [{
                data: Object.values(sentimentPercentages),
                backgroundColor: sentimentColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: false, // Disable responsive to use fixed dimensions
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Full Results Toggle
document.getElementById('fullResultsBtn').addEventListener('click', function() {
    const fullResults = document.getElementById('fullResults');
    const icon = this.querySelector('.toggle-icon');
    
    if (fullResults.classList.contains('show')) {
        fullResults.classList.remove('show');
        this.setAttribute('aria-expanded', 'false');
    } else {
        fullResults.classList.add('show');
        this.setAttribute('aria-expanded', 'true');
    }
});


//background
$(document).ready(function(){
	// set #background-* to full window height and fade in the body
	var width = $(window).width();
	var height = $(window).height();
		$('#background-container, #background-1, #background-2').css({
			'min-width': width,
			'min-height': height
		});

	// call new svg and start recreate svg timeout
	svgNew();
	recreateSvg();
});

// set global svg object
var svg = {};
// used to determine which background to draw to
var draw = 1;
// create new svg 
var svgNew = function(){
	svg.t = new Trianglify({
		noiseIntensity: 0,
	});
	// set svg size to window height and width
	svg.width = $(window).width();
	svg.height = $(window).height();
	svg.pattern = svg.t.generate(svg.width, svg.height);
	// draw svg on to either background 1 or 2
	if (draw === 1) {
		svgDraw1();
	} else {
		svgDraw2();
	}
}; // end svgNew

// draw svg on to bg1 and call fade
// if called with resize, redraw the svg to match new size and do not call fade
var svgDraw1 = function (resize){
	draw = 2;
	if (resize === 'resize') {	
		svg.pattern = svg.t.generate(svg.width, svg.height);
		$('#background-1').css({
			'min-width': svg.width,
			'min-height': svg.height,
			'background': svg.pattern.dataUrl
		});
		$('#contact-background-1').css({
			'min-width': svg.width,
			'min-height': (svg.height / 2),
			'background': svg.pattern.dataUrl
		});
	} else {
		$('.background-1').css({
			'background': svg.pattern.dataUrl
		});
		fade1();
	}
}; // end svgDraw1

// same as above but for bg2
var svgDraw2 = function(resize){
	draw = 1;
	if (resize === 'resize') {	
		svg.pattern = svg.t.generate(svg.width, svg.height);
		$('#background-2').css({
			'min-width': svg.width,
			'min-height': svg.height,
			'background': svg.pattern.dataUrl
		});
		$('#contact-background-2').css({
			'min-width': svg.width,
			'min-height': (svg.height / 2),
			'background': svg.pattern.dataUrl
		});
	} else {
		$('.background-2').css({
			'background': svg.pattern.dataUrl
		});
		fade2();
	}
}; // end svgDraw2

// fade in bg1 and fade our bg2
var fade1 = function(){
	$('.background-1').velocity("fadeIn", { duration: 3000 });
	$('.background-2').velocity("fadeOut", { duration: 4000 });
};
// fade in bg2 and fade out bg1
var fade2 = function(){
	$('.background-2').velocity("fadeIn", { duration: 3000 });
	$('.background-1').velocity("fadeOut", { duration: 4000 });
};

// timeout function to create new svg every 5 seconds
var recreateSvg = function(){
 	window.setInterval(svgNew, 5000);
};

// redraw the current svg to match screen size on resize
$(window).resize(function() {
	svg.width = $(window).width();
	svg.height = $(window).height();
	$('#background-container').css({
		'min-width': svg.width,
		'min-height': svg.height
	});
	$('#contact-container').css({
		'min-width': svg.width,
		'min-height': (svg.height / 2)
	});
	svgDraw1('resize');
	svgDraw2('resize');
});