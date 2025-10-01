# analysis/app.py

import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
import requests
import os
from celery import Celery
from celery.exceptions import TimeoutError
from dotenv import load_dotenv

# Configure logging to file and console
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('/tmp/flask.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Load .env file from backend folder
env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend', '.env')
if os.path.exists(env_file):
    logger.info(f"Loading .env file from {env_file}")
    load_dotenv(env_file)
    logger.debug(f"COINGECKO_API_KEY: {'set' if os.environ.get('COINGECKO_API_KEY') else 'not set'}")
else:
    logger.error(f".env file not found at {env_file}")

app = Flask(__name__)
CORS(app)

app.config['CELERY_BROKER_URL'] = 'redis://:1234567@localhost:6379/0'
app.config['CELERY_RESULT_BACKEND'] = 'redis://:1234567@localhost:6379/0'
celery = Celery(app.name, broker=app.config['CELERY_BROKER_URL'])
celery.conf.update(app.config)

BACKEND_URL = os.environ.get('BACKEND_URL', 'http://localhost:3001')

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
    logger.info(f"Received /score-token request: {request.json}")
    try:
        # Validate request JSON
        data = request.json
        if not data or 'data' not in data or 'horizon' not in data:
            logger.error('Invalid request: data and horizon required')
            return jsonify({'error': 'Invalid request: data and horizon required'}), 400

        token_data = data['data']
        horizon = data['horizon']
        try:
            weights = data.get('weights', DEFAULT_WEIGHTS)
            total_weight = sum(weights.values())
            if total_weight == 0:
                logger.error('Invalid weights: sum must be non-zero')
                return jsonify({'error': 'Invalid weights: sum must be non-zero'}), 400
            normalized_weights = {k: v / total_weight for k, v in weights.items()}
        except Exception as e:
            logger.error(f"Error processing weights: {str(e)}")
            return jsonify({'error': f'Error processing weights: {str(e)}'}), 500

        # Validate token data
        if not token_data.get('id') or not token_data.get('symbol'):
            logger.error(f"Invalid token data: id={token_data.get('id')}, symbol={token_data.get('symbol')}")
            return jsonify({'error': 'Invalid token data: id and symbol required'}), 400

        # Fetch backend data
        logger.debug(f"Fetching macro and sentiment data for {token_data['symbol']}")
        macro_data = None
        sentiment_data = None
        try:
            macro_data = fetch_from_backend('/fetch-macro')
            logger.debug(f"Macro data: {macro_data}")
        except Exception as e:
            logger.error(f"Failed to fetch macro data: {str(e)}")

        try:
            sentiment_data = fetch_from_backend(f'/fetch-sentiment?tokenSymbol={token_data["symbol"]}')
            logger.debug(f"Sentiment data: {sentiment_data}")
        except Exception as e:
            logger.error(f"Failed to fetch sentiment data: {str(e)}")

        # Calculate scores
        scores = {}
        try:
            scores = {
                'macro': calculate_macro_score(macro_data),
                'sentiment': calculate_sentiment_score(token_data, sentiment_data),
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
            logger.debug(f"Scores calculated for {token_data['id']}: {scores}")
        except Exception as e:
            logger.error(f"Error calculating scores for {token_data['id']}: {str(e)}")
            return jsonify({'error': f'Error calculating scores: {str(e)}'}), 500

        # Aggregate scores
        try:
            aggregated_score = sum(scores.get(f, 0) * normalized_weights.get(f, 0) for f in scores)
            logger.debug(f"Aggregated score for {token_data['id']}: {aggregated_score}")
        except Exception as e:
            logger.error(f"Error aggregating scores for {token_data['id']}: {str(e)}")
            return jsonify({'error': f'Error aggregating scores: {str(e)}'}), 500

        # Fetch historical prices and predict
        historical_prices = None
        try:
            historical_prices = fetch_historical_prices(token_data['id'])
            if historical_prices.empty:
                logger.warning(f"No historical prices for {token_data['id']}; using fallback prediction")
                prediction = 1000.0
            else:
                logger.debug(f"Historical prices fetched for {token_data['id']}: {len(historical_prices)} rows")
                try:
                    historical_list = historical_prices[['timestamp', 'price']].values.tolist()
                    task = predict_price.delay(historical_list, horizon, macro_data, sentiment_data)
                    logger.debug(f"Started Celery task for {token_data['id']}: {task.id}")
                    prediction = task.get(timeout=10)
                    logger.debug(f"Received prediction for {token_data['id']}: {prediction}")
                    if prediction <= 0:
                        logger.warning(f"Invalid prediction for {token_data['id']}: {prediction}; using fallback")
                        prediction = 1000.0
                except TimeoutError as e:
                    logger.error(f"Celery timeout for {token_data['id']}: {str(e)}")
                    prediction = 1000.0
                except Exception as e:
                    logger.error(f"Celery error for {token_data['id']}: {str(e)}")
                    prediction = 1000.0
        except Exception as e:
            logger.error(f"Error fetching or predicting prices for {token_data['id']}: {str(e)}")
            prediction = 1000.0

        # Prepare response
        try:
            response = {
                'risk_score': min(max(aggregated_score * 2.5, 0), 10),
                'recommendation': 'buy' if aggregated_score > 0.8 else 'monitor' if aggregated_score > 0 else 'avoid',
                'price_target': float(prediction),
                'factor_scores': {k: float(v) for k, v in scores.items()}
            }
            logger.info(f"Returning /score-token response for {token_data['id']}: {response}")
            return jsonify(response)
        except Exception as e:
            logger.error(f"Error preparing response for {token_data['id']}: {str(e)}")
            return jsonify({'error': f'Error preparing response: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"Score token error for {request.json.get('data', {}).get('id', 'unknown')}: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

def fetch_from_backend(endpoint):
    try:
        logger.debug(f"Fetching from backend: {BACKEND_URL}{endpoint}")
        response = requests.get(f"{BACKEND_URL}{endpoint}", timeout=5)
        response.raise_for_status()
        data = response.json()
        logger.debug(f"Backend response for {endpoint}: {data}")
        return data
    except requests.RequestException as e:
        logger.error(f"Failed to fetch from backend {endpoint}: {str(e)}")
        return None

def calculate_macro_score(macro_data):
    try:
        if not macro_data or not isinstance(macro_data, dict) or 'cpi' not in macro_data:
            logger.debug("No valid macro data available")
            return 0
        latest_cpi = float(macro_data['cpi'][-1]['value']) if macro_data['cpi'] else 0
        logger.debug(f"Macro score calculated with CPI: {latest_cpi}")
        return -2 if latest_cpi > 5 else 2 if latest_cpi < 2 else 0
    except (IndexError, ValueError, KeyError) as e:
        logger.error(f"Macro score error: {str(e)}")
        return 0

def calculate_sentiment_score(token_data, sentiment_data):
    try:
        if not sentiment_data or not isinstance(sentiment_data, dict):
            logger.debug(f"No sentiment data for {token_data.get('symbol')}")
            return 0
        fear_greed = sentiment_data.get('fearGreed', {}).get('value', 50)
        logger.debug(f"Sentiment score calculated with fear_greed: {fear_greed}")
        return (float(fear_greed) - 50) / 25
    except (ValueError, KeyError) as e:
        logger.error(f"Sentiment score error: {str(e)}")
        return 0

def calculate_crypto_specific_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"Crypto-specific score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"Crypto-specific score error: {str(e)}")
        return 0

def calculate_on_chain_tech_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"On-chain tech score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"On-chain tech score error: {str(e)}")
        return 0

def calculate_geopolitics_score():
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"Geopolitics score: {score}")
        return score
    except Exception as e:
        logger.error(f"Geopolitics score error: {str(e)}")
        return 0

def calculate_ai_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"AI score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"AI score error: {str(e)}")
        return 0

def calculate_esg_whales_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"ESG whales score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"ESG whales score error: {str(e)}")
        return 0

def calculate_depin_gaming_privacy_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"DePin gaming privacy score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"DePin gaming privacy score error: {str(e)}")
        return 0

def calculate_quantum_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"Quantum score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"Quantum score error: {str(e)}")
        return 0

def calculate_cbdc_score():
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"CBDC score: {score}")
        return score
    except Exception as e:
        logger.error(f"CBDC score error: {str(e)}")
        return 0

def calculate_restaking_defi_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"Restaking DeFi score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"Restaking DeFi score error: {str(e)}")
        return 0

def calculate_creator_social_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"Creator social score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"Creator social score error: {str(e)}")
        return 0

def calculate_cross_chain_score(token_data):
    try:
        score = np.random.uniform(-2, 2)
        logger.debug(f"Cross-chain score for {token_data.get('symbol')}: {score}")
        return score
    except Exception as e:
        logger.error(f"Cross-chain score error: {str(e)}")
        return 0

def calculate_regulatory_score():
    try:
        regulatory_data = fetch_from_backend('/fetch-standard-regulatory')
        news_data = fetch_from_backend('/fetch-regulatory')
        logger.debug(f"Regulatory data: {regulatory_data}")
        logger.debug(f"Regulatory news data: {news_data}")
        if not regulatory_data and not news_data:
            logger.debug("No regulatory data available")
            return 0

        total_score = 0
        count = 0
        positive_keywords = ['approval', 'clarity', 'favorable', 'adoption', 'etf', 'crypto', 'blockchain', 'stablecoin', 'digital securities']
        negative_keywords = ['enforcement', 'lawsuit', 'clampdown', 'violation', 'probe']

        if regulatory_data:
            try:
                for company, filings in regulatory_data.items():
                    for filing in filings:
                        text = filing.get('description', '')
                        form = filing.get('form', '').lower()
                        if text:
                            pos_count = sum(text.lower().count(kw) for kw in positive_keywords)
                            neg_count = sum(text.lower().count(kw) for kw in negative_keywords)
                            form_weight = 1.5 if form in ['8-k', '10-q', '10-k'] else 1.0
                            filing_score = form_weight * (pos_count - neg_count) / (pos_count + neg_count + 1)
                            total_score += filing_score
                            count += 1
                            logger.debug(f"Regulatory filing score: {filing_score}")
            except Exception as e:
                logger.error(f"Error processing regulatory data: {str(e)}")

        if news_data:
            try:
                for article in news_data:
                    text = article.get('title', '') + ' ' + article.get('description', '')
                    if text:
                        pos_count = sum(text.lower().count(kw) for kw in positive_keywords)
                        neg_count = sum(text.lower().count(kw) for kw in negative_keywords)
                        article_score = (pos_count - neg_count) / (pos_count + neg_count + 1)
                        total_score += article_score
                        count += 1
                        logger.debug(f"Regulatory news score: {article_score}")
            except Exception as e:
                logger.error(f"Error processing news data: {str(e)}")

        score = (total_score / count) * 2 if count > 0 else 0
        logger.debug(f"Regulatory score: {score}")
        return score
    except Exception as e:
        logger.error(f"Regulatory score error: {str(e)}")
        return 0

def fetch_historical_prices(coin_id):
    try:
        logger.info(f"Fetching historical prices for {coin_id}")
        api_key = os.environ.get('COINGECKO_API_KEY', '')
        logger.debug(f"COINGECKO_API_KEY: {'set' if api_key else 'not set'}")
        if not api_key:
            logger.error("No COINGECKO_API_KEY set in environment")
            return pd.DataFrame({'timestamp': [], 'price': []})
        headers = {'x-cg-demo-api-key': api_key}
        url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart?vs_currency=usd&days=365"
        logger.debug(f"Sending request to CoinGecko: {url}")
        response = requests.get(url, headers=headers, timeout=5)
        logger.debug(f"CoinGecko response status: {response.status_code}, response: {response.text[:200]}")
        response.raise_for_status()
        data = response.json()
        if not data.get('prices'):
            logger.warning(f"No price data for {coin_id} from CoinGecko")
            return pd.DataFrame({'timestamp': [], 'price': []})
        logger.debug(f"Received {len(data['prices'])} price points for {coin_id}")
        df = pd.DataFrame(data['prices'], columns=['timestamp', 'price'])
        logger.debug(f"DataFrame created with {len(df)} rows")
        return df
    except requests.RequestException as e:
        logger.error(f"Error fetching CoinGecko prices for {coin_id}: {str(e)}")
        return pd.DataFrame({'timestamp': [], 'price': []})
    except Exception as e:
        logger.error(f"Unexpected error in fetch_historical_prices for {coin_id}: {str(e)}")
        return pd.DataFrame({'timestamp': [], 'price': []})

@celery.task
def predict_price(historical_list, horizon, macro_data, sentiment_data):
    try:
        logger.info(f"Running predict_price for horizon: {horizon}")
        if not historical_list:
            logger.error("Historical prices are empty")
            raise ValueError("Historical prices are empty")
        df = pd.DataFrame(historical_list, columns=['timestamp', 'price'])
        logger.debug(f"Historical data: {len(df)} rows")
        try:
            # Use weighted moving average for recent prices
            recent_prices = df['price'].tail(30)
            weights = np.linspace(0.5, 1.5, len(recent_prices))
            weights /= weights.sum()  # Normalize weights
            base_prediction = np.average(recent_prices, weights=weights)
            logger.debug(f"Base prediction (weighted MA): {base_prediction}")
            if base_prediction <= 0:
                logger.error(f"Invalid prediction value: {base_prediction}")
                raise ValueError(f"Invalid prediction value: {base_prediction}")
        except Exception as e:
            logger.error(f"Error generating base prediction: {str(e)}")
            raise
        try:
            macro_factor = 1 + calculate_macro_score(macro_data) / 20  # Adjusted to boost MOON price target
            sentiment_factor = 1 + calculate_sentiment_score({}, sentiment_data) / 10
            prediction = base_prediction * macro_factor * sentiment_factor
            logger.info(f"Prediction result: {prediction}")
            return prediction
        except Exception as e:
            logger.error(f"Error calculating final prediction: {str(e)}")
            raise
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        raise

if __name__ == '__main__':
    logger.info("Starting Flask server")
    app.run(port=int(os.environ.get('ANALYSIS_PORT', 5000)), debug=True)
