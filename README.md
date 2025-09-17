# BTC and ETH Analysis Service

[![Node.js](https://img.shields.io/badge/Node.js-18.0.0+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Author](https://img.shields.io/badge/Author-Muhammad%20Bilal%20Motiwala-orange.svg)](https://github.com/bilalmotiwala)

A comprehensive cryptocurrency analysis service that monitors Bitcoin and Ethereum price movements, performs AI-powered trend analysis, and provides sophisticated market insights for Black Swan.

## 🚀 Features

### Core Analysis Capabilities

- **Real-time Price Monitoring**: Continuous monitoring of BTC and ETH prices with minute-by-minute granularity
- **Multi-timeframe Analysis**: Short-term trends (24-hour minute data) and long-term trends (~900 days of daily closes)
- **AI-Powered Insights**: Advanced market analysis using OpenRouter LLM integration
- **Individual Asset Analysis**: Separate analysis for Bitcoin and Ethereum without cross-asset comparisons
- **Data Quality Assessment**: Comprehensive validation and quality metrics for all data inputs

### Technical Features

- **RESTful API**: Complete API for integration with external systems
- **Firestore Integration**: Persistent storage of analysis results and historical data
- **Automated Scheduling**: Cron-based automated analysis every hour
- **Data Caching**: Optimized performance with intelligent data caching
- **Security**: Rate limiting, CORS, helmet security, and environment-based configuration
- **Monitoring**: Comprehensive logging and health check endpoints

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **OpenRouter API Key**: Required for AI analysis (get from [OpenRouter](https://openrouter.ai/))
- **Firebase Project** (Optional): For data persistence (get from [Firebase Console](https://console.firebase.google.com/))

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd btc-eth-analysis-service
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your actual values
nano .env
```

### 4. Required Environment Variables

```bash
# REQUIRED: OpenRouter API Key for AI analysis
OPENROUTER_API_KEY=your_openrouter_api_key_here

# OPTIONAL: Server configuration
PORT=8085
DATA_SERVICE_URL=your_data_collection_service_here
NODE_ENV=development
```

### 5. Firebase Configuration (Optional)

If you want to persist analysis results:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Generate a service account key:
   - Go to Project Settings → Service Accounts
   - Click "Generate new private key"
   - Download the JSON file
3. Rename the downloaded file to `serviceAccountKey.json`
4. Place it in the project root directory

**Note**: The service can run without Firestore, but analysis results won't be persisted.

## 🚀 Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Manual Analysis Trigger

```bash
curl -X POST http://localhost:8085/api/analyze
```

## 📊 API Documentation

### Base URL

```
http://localhost:8085
```

### Endpoints

#### 1. Health Check

```http
GET /
```

**Response:**

```json
{
  "service": "BTC/ETH Performance & Trend Analysis Service",
  "version": "1.0.0",
  "status": "operational",
  "description": "Provides per-asset BTC & ETH performance/trend analysis",
  "focus": [
    "BTC/ETH performance & trend",
    "24H minute-level + ~900d daily closes",
    "Per-asset analysis only (no cross-asset factors)"
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 2. Service Status

```http
GET /api/status
```

**Response:**

```json
{
  "status": "operational",
  "uptime": 3600,
  "analysisState": {
    "isRunning": false,
    "lastAnalysisTime": 1704067200000,
    "totalAnalyses": 24,
    "recentAnalyses": [...],
    "lastAnalysisAgo": "5.2 minutes"
  },
  "config": {
    "dataContext": {
      "RECENT_MINUTES": 60,
      "HISTORICAL_DAYS": 7,
      "MAX_RECENT_POINTS": 60,
      "MAX_HISTORICAL_POINTS": 168
    },
    "analysisInterval": "Every 5 minutes"
  },
  "integrations": {
    "firestore": true,
    "openrouter": true,
    "dataService": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 3. Data Quality Assessment

```http
GET /api/data-quality
```

**Response:**

```json
{
  "success": true,
  "dataQuality": {
    "bitcoin": {
      "recent": {
        "isValid": true,
        "actualPoints": 60,
        "expectedPoints": 60,
        "coverage": 100,
        "latestDataAge": 2.5,
        "gaps": []
      },
      "historical": {
        "isValid": true,
        "actualPoints": 168,
        "expectedPoints": 168,
        "coverage": 100,
        "spanDays": 7,
        "gaps": []
      }
    },
    "ethereum": {
      "recent": {
        "isValid": true,
        "actualPoints": 60,
        "expectedPoints": 60,
        "coverage": 100,
        "latestDataAge": 2.1,
        "gaps": []
      },
      "historical": {
        "isValid": true,
        "actualPoints": 168,
        "expectedPoints": 168,
        "coverage": 100,
        "spanDays": 7,
        "gaps": []
      }
    },
    "overall": {
      "isValid": true,
      "score": 100,
      "issues": [],
      "recommendations": []
    }
  },
  "dataStructure": {
    "recentGranularity": "minute-by-minute (last 60 minutes)",
    "historicalGranularity": "hour-by-hour (last 7 days)",
    "multiTimeframeAnalysis": "1h, 6h, 24h, 7d price changes with correlation insights"
  },
  "qualityThresholds": {
    "recentDataMinCoverage": "70%",
    "historicalDataMinCoverage": "60%",
    "maxLatestDataAge": "10 minutes",
    "maxRecentGaps": 15,
    "maxHistoricalGaps": 30,
    "minHistoricalSpan": "4 days"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 4. Manual Analysis Trigger

```http
POST /api/analyze
```

**Response:**

```json
{
  "success": true,
  "analysis": {
    "bitcoin": {
      "short_term_trend": "Bitcoin shows a slight upward trend over the last 24 hours...",
      "long_term_trend": "Over the past 900 days, Bitcoin has experienced significant volatility...",
      "momentum_signals": [
        "Recent price consolidation above key support level",
        "Volume increase in the last 4 hours"
      ],
      "notable_levels": ["Support at $42,000", "Resistance at $45,000"],
      "summary": "Bitcoin maintains bullish momentum with key support levels holding."
    },
    "ethereum": {
      "short_term_trend": "Ethereum displays moderate volatility in the 24-hour timeframe...",
      "long_term_trend": "Long-term analysis shows Ethereum following broader market trends...",
      "momentum_signals": [
        "Price action above 20-day moving average",
        "Decreasing volatility in recent sessions"
      ],
      "notable_levels": ["Support at $2,800", "Resistance at $3,200"],
      "summary": "Ethereum shows stable price action with moderate bullish sentiment."
    }
  },
  "inputCounts": {
    "btc_minutes24h": 288,
    "btc_daily": 900,
    "eth_minutes24h": 288,
    "eth_daily": 900
  },
  "stored": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 5. Recent Analyses

```http
GET /api/analyses?limit=10
```

**Response:**

```json
{
  "success": true,
  "analyses": [
    {
      "id": "analysis_doc_id",
      "bitcoin": {
        "short_term_trend": "...",
        "long_term_trend": "...",
        "momentum_signals": [...],
        "notable_levels": [...],
        "summary": "..."
      },
      "ethereum": {
        "short_term_trend": "...",
        "long_term_trend": "...",
        "momentum_signals": [...],
        "notable_levels": [...],
        "summary": "..."
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "service": "crypto-data-analysis-service"
    }
  ],
  "count": 10,
  "error": null,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### 6. Current Crypto Data

```http
GET /api/crypto-data
```

**Response:**

```json
{
  "success": true,
  "currentPrices": {
    "bitcoin": 43250.50,
    "ethereum": 2950.25
  },
  "recentData": {
    "bitcoin": [
      {
        "timestamp": 1704067200000,
        "price": 43250.50,
        "collected_at": "2024-01-01T00:00:00.000Z",
        "source": "data_collection_service"
      }
    ],
    "ethereum": [
      {
        "timestamp": 1704067200000,
        "price": 2950.25,
        "collected_at": "2024-01-01T00:00:00.000Z",
        "source": "data_collection_service"
      }
    ]
  },
  "historicalData": {
    "bitcoin": [...],
    "ethereum": [...]
  },
  "dataStructure": {
    "recentGranularity": "minute-by-minute (last 60 minutes)",
    "historicalGranularity": "hour-by-hour (last 7 days)",
    "multiTimeframeAnalysis": "1h, 6h, 24h, 7d price changes with correlation insights",
    "bitcoinDataQuality": {...},
    "ethereumDataQuality": {...}
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🔧 Configuration

### Environment Variables

| Variable             | Required | Default       | Description                        |
| -------------------- | -------- | ------------- | ---------------------------------- |
| `OPENROUTER_API_KEY` | Yes      | -             | OpenRouter API key for AI analysis |
| `PORT`               | No       | 8085          | Server port                        |
| `DATA_SERVICE_URL`   | No       | [Default URL] | Data collection service URL        |
| `NODE_ENV`           | No       | development   | Node.js environment                |

### Data Context Configuration

The service uses the following data context for analysis:

- **Recent Data**: Last 60 minutes of minute-by-minute prices
- **Historical Data**: Last 7 days of hourly aggregated OHLC data
- **Daily Cache**: ~900 days of daily closing prices (cached and refreshed daily)

### Analysis Schedule

- **Automated Analysis**: Runs 2 minutes before every hour (58 minutes past)
- **Cache Refresh**: Daily at 00:05 (5 minutes past midnight)
- **Manual Trigger**: Available via API endpoint

## 🏗️ Architecture

### Core Components

1. **CryptoDataFetcher**: Handles data retrieval, validation, and aggregation
2. **PerformanceTrendEngine**: AI-powered analysis using OpenRouter LLM
3. **FirestoreManager**: Data persistence and retrieval
4. **PromptManager**: Manages analysis prompts and templates

### Data Flow

```
External Data Service → CryptoDataFetcher → Data Validation →
PerformanceTrendEngine → AI Analysis → FirestoreManager → Storage
```

### Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Cross-origin resource sharing enabled
- **Helmet**: Security headers and CSP
- **Environment Variables**: Secure configuration management
- **Input Validation**: Comprehensive data validation

## 📈 Monitoring and Logging

### Log Levels

- **✅ Success**: Successful operations
- **⚠️ Warning**: Non-critical issues
- **❌ Error**: Critical errors
- **ℹ️ Info**: General information
- **🔄 Process**: Ongoing operations

### Health Monitoring

- Service status endpoint for health checks
- Analysis state monitoring
- Integration status tracking
- Data quality metrics

## 🚨 Error Handling

The service includes comprehensive error handling:

- **API Errors**: Structured error responses with appropriate HTTP status codes
- **Data Errors**: Graceful handling of missing or invalid data
- **Network Errors**: Retry logic and fallback mechanisms
- **LLM Errors**: Fallback responses when AI analysis fails

## 🔒 Security Considerations

1. **API Key Security**: Store OpenRouter API key in environment variables
2. **Firebase Security**: Keep serviceAccountKey.json secure and never commit to version control
3. **Rate Limiting**: Prevents abuse and ensures service stability
4. **Input Validation**: All inputs are validated before processing
5. **Error Information**: Sensitive information is not exposed in error messages

## 🧪 Testing

### Manual Testing

```bash
# Test health endpoint
curl http://localhost:8085/

# Test status endpoint
curl http://localhost:8085/api/status

# Test data quality
curl http://localhost:8085/api/data-quality

# Trigger manual analysis
curl -X POST http://localhost:8085/api/analyze
```

### Integration Testing

The service can be tested with external monitoring tools:

- Health check endpoints for load balancers
- Status endpoints for monitoring dashboards
- Data quality endpoints for alerting systems

## 📚 Dependencies

### Core Dependencies

- **express**: Web framework
- **cors**: Cross-origin resource sharing
- **helmet**: Security middleware
- **express-rate-limit**: Rate limiting
- **compression**: Response compression
- **firebase-admin**: Firestore integration
- **axios**: HTTP client
- **dotenv**: Environment variable management
- **node-cron**: Scheduled tasks

### Development Dependencies

- **nodemon**: Development server with auto-restart

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add comprehensive comments
5. Test your changes
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Muhammad Bilal Motiwala**

- GitHub: [@bilalmotiwala](https://github.com/bilalmotiwala)
- Email: [bilal@oaiaolabs.com](mailto:bilal@oaiaolabs.com)

## 🆘 Support

For support and questions:

1. Check the API documentation above
2. Review the logs for error messages
3. Verify your environment configuration
4. Ensure all required services are running

## 🔄 Updates and Maintenance

### Regular Maintenance

- Monitor API key expiration
- Update dependencies regularly
- Review and rotate credentials
- Monitor service performance

### Scaling Considerations

- The service is designed to handle moderate load
- For high-traffic scenarios, consider:
  - Load balancing
  - Database optimization
  - Caching strategies
  - Horizontal scaling

---

**Note**: This service is part of Black Swan and is designed for cryptocurrency market analysis. Always ensure you have proper API keys and follow security best practices when deploying to production.
