# analysis/app.py

from flask import Flask, request, jsonify
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression  # Placeholder; use LSTM in full
import requests
import os
from celery import Celery

app = Flask(__name__)

# Celery config for async (e.g., long ML tasks)
app.config['CELERY_BROKER_URL'] = 'redis://:1234567@localhost:6379/0'
app.config['CELERY_RESULT_BACKEND'] = 'redis://:1234567@localhost:6379/0'
celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)

# Backend URL for fetching data (macro, sentiment, etc.)
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:3001')

# Default weights from spec + additional factors
DEFAULT_WEIGHTS = {
    'macro': 0.35,
    'crypto_specific': 0.25,
    'sentiment': 0.20,
    'on_chain_tech': 0.10,
    'correlations_geopolitics': 0.10,
    'ai': 0.15,
    'regulatory': 0.15,
    'esg_whales': 0.10,
    'depin_gaming_privacy': 0.05,
    'quantum': 0.05,
    'cbdc': 0.10,
    'restaking_defi': 0.10,
    'creator_social': 0.05,
    'cross_chain': 0.05
}

@app.route('/score-token', methods=['POST'])
def score_token():
    data = request.json
    token_data = data['data']  # From CoinGecko
    horizon = data['horizon']  # 'short' or 'long'
    weights = data.get('weights', DEFAULT_WEIGHTS)

    # Normalize weights
    total_weight = sum(weights.values())
    normalized_weights = {k: v / total_weight for k, v in weights.items()}

    # Fetch latest macro and sentiment from backend
    macro_data = fetch_from_backend('/fetch-macro')  # CPI trends, etc.
    sentiment_data = fetch_from_backend(f'/fetch-sentiment?tokenSymbol={token_data["symbol"]}')  # Token-specific if available

    # Step 1: Gather and score factors (integrated with fetched data)
    scores = {
        'macro': calculate_macro_score(macro_data),  # Use fetched CPI for inflation/policy
        'sentiment': calculate_sentiment_score(token_data, sentiment_data),  # Use fetched fear_greed
        'crypto_specific': calculate_crypto_specific_score(token_data),
        'on_chain_tech': calculate_on_chain_tech_score(token_data),
        'correlations_geopolitics': calculate_geopolitics_score(),
        'ai': calculate_ai_score(token_data),
        'regulatory': calculate_regulatory_score(),
        'esg_whales': calculate_esg_whales_score(token_data),
        'depin_gaming_privacy': calculate_depin_gaming_privacy_score(token_data),
        'quantum': calculate_quantum_score(token_data),
        'cbdc': calculate_cbdc_score(),
        'restaking_defi': calculate_restaking_defi_score(token_data),
        'creator_social': calculate_creator_social_score(token_data),
        'cross_chain': calculate_cross_chain_score(token_data)
    }

    # Weighted aggregation
    aggregated_score = sum(scores.get(f, 0) * normalized_weights.get(f, 0) for f in scores)

    # Predictive modeling (enhanced with macro/sentiment)
    historical_prices = fetch_historical_prices(token_data['id'])
    prediction = predict_price.delay(historical_prices, horizon, macro_data, sentiment_data).get()  # Async Celery call

    return jsonify({
        'risk_score': min(max(aggregated_score * 2.5, 0), 10),  # Scale to 0-10
        'recommendation': 'buy' if aggregated_score > 0.8 else 'monitor' if aggregated_score > 0 else 'avoid',
        'price_target': prediction,
        'factor_scores': scores  # For frontend visuals
    })

def fetch_from_backend(endpoint):
    try:
        response = requests.get(f"{BACKEND_URL}{endpoint}")
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        app.logger.error(f"Failed to fetch from backend {endpoint}: {e}")
        return None

def calculate_macro_score(macro_data):
    if not macro_data:
        return 0
    # Example: Bearish if high inflation
    latest_cpi = float(macro_data[-1]['value']) if macro_data else 0
    return -2 if latest_cpi > 5 else 2 if latest_cpi < 2 else 0  # % thresholds for bullish/bearish

def calculate_sentiment_score(token_data, sentiment_data):
    if not sentiment_data:
        return 0
    # Enhanced: Normalize fear_greed to -2/2
    fear_greed = sentiment_data.get('fear_greed', 50)
    return (fear_greed - 50) / 25

# Add expanded functions for other scores (similar integration)
def calculate_crypto_specific_score(token_data):
    return np.random.uniform(-2, 2)  # Expand with FDV, unlocks

# ... (Similar for remaining factors)

def fetch_historical_prices(coin_id):
    response = requests.get(f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart?vs_currency=usd&days=365")
    return pd.DataFrame(response.json()['prices'], columns=['timestamp', 'price'])

@celery.task
def predict_price(historical, horizon, macro_data, sentiment_data):
    df = historical.copy()
    df['day'] = np.arange(len(df))
    model = LinearRegression()
    model.fit(df[['day']], df['price'])
    future_days = 90 if horizon == 'short' else 365
    future = np.arange(len(df), len(df) + future_days).reshape(-1, 1)
    base_prediction = model.predict(future)[-1]

    # Integrate factors: Adjust by macro/sentiment multipliers
    macro_factor = 1 + calculate_macro_score(macro_data) / 10  # Slight adjustment
    sentiment_factor = 1 + calculate_sentiment_score({}, sentiment_data) / 10
    return base_prediction * macro_factor * sentiment_factor

if __name__ == '__main__':
    app.run(port=int(os.environ.get('ANALYSIS_PORT', 5000)), debug=True)
