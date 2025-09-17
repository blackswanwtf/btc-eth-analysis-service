/**
 * Black Swan BTC and ETH Analysis Service
 *
 * A comprehensive cryptocurrency analysis service that monitors Bitcoin and Ethereum
 * price movements, performs trend analysis, and provides AI-powered market insights.
 *
 * Features:
 * - Real-time price monitoring and analysis
 * - Multi-timeframe trend analysis (short-term and long-term)
 * - AI-powered market insights using OpenRouter LLM
 * - Firestore integration for data persistence
 * - RESTful API for external integrations
 * - Automated scheduled analysis
 *
 * Author: Muhammad Bilal Motiwala
 * Project: Black Swan
 * Version: 1.0.0
 */

// Load environment variables from .env file
require("dotenv").config();

// Core Express.js dependencies
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");

// Firebase Admin SDK for Firestore integration
const admin = require("firebase-admin");

// HTTP client for external API calls
const axios = require("axios");

// Cron job scheduler for automated analysis
const cron = require("node-cron");

// Event emitter for internal communication
const { EventEmitter } = require("events");

// Custom prompt management system
const PromptManager = require("./prompts/prompt-config");

/**
 * Firebase Admin SDK Initialization
 *
 * Initializes Firebase Admin SDK for Firestore database integration.
 * The service can run without Firestore if the serviceAccountKey.json file
 * is not available, but analysis results won't be persisted.
 */
let serviceAccount;
try {
  // Load Firebase service account credentials
  serviceAccount = require("./serviceAccountKey.json");

  // Initialize Firebase Admin with service account credentials
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ [FIREBASE] Admin SDK initialized successfully");
} catch (error) {
  console.error("❌ [FIREBASE] Admin initialization failed:", error.message);
  console.log("ℹ️ [FIREBASE] Service will run without Firestore integration");
}

// Get Firestore database instance (null if initialization failed)
const db = admin.firestore ? admin.firestore() : null;

/**
 * Service Configuration
 *
 * Centralized configuration object containing all service settings.
 * Environment variables take precedence over default values for security.
 */
const CONFIG = {
  /**
   * Data Collection Service URL
   * External service that provides real-time cryptocurrency price data
   */
  DATA_SERVICE_URL: process.env.DATA_SERVICE_URL,

  /**
   * OpenRouter API Configuration
   * Used for AI-powered market analysis and insights generation
   * SECURITY: API key must be provided via environment variable
   */
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || null,
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",

  /**
   * Analysis Configuration
   * Controls the frequency and timing of automated analysis
   */
  ANALYSIS_INTERVAL: 300000, // 5 minutes (cron already set to every 5 minutes)

  /**
   * Drop Detection Thresholds (Deprecated)
   * Legacy configuration - no longer used in current implementation
   */
  DROP_THRESHOLDS: {},

  /**
   * Data Context Configuration
   * Defines the timeframes and granularity for data analysis
   */
  DATA_CONTEXT: {
    RECENT_MINUTES: 60, // Last 60 minutes for minute-by-minute granular analysis
    HISTORICAL_DAYS: 7, // Last 7 days for hourly historical context
    MAX_RECENT_POINTS: 60, // Minute-level data points for recent period
    MAX_HISTORICAL_POINTS: 168, // Hourly data points for 7 days (7 * 24 = 168 hours)
  },

  /**
   * Server Configuration
   * Port configuration for the Express.js server
   */
  PORT: process.env.PORT || 8085,
};

/**
 * Event Emitter for Internal Communication
 *
 * Used for inter-component communication and event handling
 * within the service architecture.
 */
const events = new EventEmitter();
events.setMaxListeners(50);

/**
 * Global Analysis State
 *
 * Tracks the current state of analysis operations, including
 * running status, timing, and historical analysis records.
 */
let analysisState = {
  isRunning: false, // Prevents concurrent analysis runs
  lastAnalysisTime: null, // Timestamp of last completed analysis
  totalAnalyses: 0, // Total number of analyses performed
  recentAnalyses: [], // Array of recent analysis results for monitoring
};

/**
 * Express.js Application Setup
 *
 * Creates and configures the main Express.js application
 * with security middleware, rate limiting, and API routes.
 */
const app = express();

/**
 * Security and Middleware Configuration
 *
 * Configures essential security middleware for the Express.js application
 * including CORS, compression, rate limiting, and request parsing.
 */

// Helmet.js security middleware with Content Security Policy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// Enable response compression for better performance
app.use(compression());

/**
 * Rate Limiting Configuration
 *
 * Prevents abuse by limiting the number of requests per IP address
 * within a specified time window.
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests, please try again later.",
});
app.use(limiter);

/**
 * Request Body Parsing Middleware
 *
 * Configures Express.js to parse JSON and URL-encoded request bodies
 * with appropriate size limits to prevent memory issues.
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/**
 * Enhanced Data Fetcher Class
 *
 * A comprehensive data fetching and processing class that retrieves and processes
 * cryptocurrency data from external sources with multiple granularities:
 *
 * Features:
 * - Minute-by-minute data for the last 60 minutes (high granularity for recent analysis)
 * - Hour-by-hour data for the last 7 days (broader historical context)
 * - Data quality validation and assessment
 * - Intelligent data extraction and aggregation
 * - Performance optimization with downsampling
 *
 * The class handles data fetching, validation, aggregation, and quality assessment
 * to ensure reliable analysis inputs for the AI-powered market insights.
 */
class CryptoDataFetcher {
  /**
   * Downsamples 1-minute price series to 5-minute resolution
   *
   * This method reduces the granularity of minute-by-minute data to 5-minute intervals
   * by grouping data points into 5-minute buckets and selecting the last (most recent)
   * price point within each bucket. This optimization reduces data volume while
   * preserving the most relevant price information for analysis.
   *
   * @param {Array<{timestamp:number, price:number}>} minuteSeries - Array of minute-level price data
   * @returns {Array<{timestamp:number, price:number}>} Downsampled 5-minute price series
   */
  downsampleToFiveMinutes(minuteSeries) {
    if (!Array.isArray(minuteSeries) || minuteSeries.length === 0) return [];
    const FIVE_MIN_MS = 5 * 60 * 1000;
    const buckets = new Map();
    for (const point of minuteSeries) {
      const bucketTs = Math.floor(point.timestamp / FIVE_MIN_MS) * FIVE_MIN_MS;
      const prev = buckets.get(bucketTs);
      if (!prev || point.timestamp >= prev.timestamp) {
        buckets.set(bucketTs, point);
      }
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, p]) => ({ timestamp: p.timestamp, price: p.price }));
  }
  /**
   * Aggregates minute-level data into hourly OHLC (Open, High, Low, Close) data points
   *
   * This method processes minute-by-minute price data and aggregates it into hourly
   * data points with comprehensive OHLC information. Each hourly data point includes:
   * - Open: First price of the hour
   * - High: Highest price during the hour
   * - Low: Lowest price during the hour
   * - Close: Last price of the hour
   * - Average: Mean price for the hour
   * - Count: Number of data points in the hour
   *
   * @param {Array} minuteData - Array of minute-level price data with timestamp and price
   * @returns {Array} Array of hourly aggregated OHLC data points
   */
  aggregateToHourlyData(minuteData) {
    if (!minuteData || minuteData.length === 0) return [];

    const hourlyData = {};

    minuteData.forEach((dataPoint) => {
      // Round timestamp down to the hour
      const hourTimestamp =
        Math.floor(dataPoint.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);

      if (!hourlyData[hourTimestamp]) {
        hourlyData[hourTimestamp] = {
          timestamp: hourTimestamp,
          prices: [],
          collected_at: dataPoint.collected_at,
          source: dataPoint.source,
        };
      }

      hourlyData[hourTimestamp].prices.push(dataPoint.price);
    });

    // Convert to array and calculate OHLC for each hour
    return Object.values(hourlyData)
      .map((hour) => {
        const prices = hour.prices.sort((a, b) => a - b);
        return {
          timestamp: hour.timestamp,
          price: prices[prices.length - 1], // Close price (last price of the hour)
          open: prices[0], // Open price (first price of the hour)
          high: Math.max(...prices), // Highest price in the hour
          low: Math.min(...prices), // Lowest price in the hour
          avg: prices.reduce((sum, price) => sum + price, 0) / prices.length, // Average price
          count: prices.length, // Number of data points in this hour
          collected_at: hour.collected_at,
          source: hour.source,
          granularity: "hourly",
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Validates data quality for minute-level recent data
   *
   * Performs comprehensive quality assessment on recent minute-level data to ensure
   * data integrity and completeness for analysis. Validates:
   * - Data coverage (percentage of expected data points)
   * - Data freshness (age of most recent data point)
   * - Gap detection (missing data intervals)
   * - Overall data quality score
   *
   * @param {Array} data - Array of minute-level data points
   * @param {string} cryptoName - Name of cryptocurrency for logging purposes
   * @returns {Object} Validation results with quality metrics and recommendations
   */
  validateRecentDataQuality(data, cryptoName) {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const expectedMinutes = 60;

    const validation = {
      isValid: false,
      actualPoints: data.length,
      expectedPoints: expectedMinutes,
      coverage: 0,
      gaps: [],
      latestDataAge: 0,
      issues: [],
    };

    if (!data || data.length === 0) {
      validation.issues.push("No recent data available");
      return validation;
    }

    // Sort data by timestamp
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);

    // Check data coverage
    validation.coverage = (data.length / expectedMinutes) * 100;

    // Check latest data freshness (should be within last 5 minutes)
    const latestTimestamp = sortedData[sortedData.length - 1].timestamp;
    validation.latestDataAge = (now - latestTimestamp) / (1000 * 60); // minutes

    if (validation.latestDataAge > 5) {
      validation.issues.push(
        `Latest data is ${validation.latestDataAge.toFixed(1)} minutes old`
      );
    }

    // Detect minute gaps
    for (let i = 1; i < sortedData.length; i++) {
      const timeDiff = sortedData[i].timestamp - sortedData[i - 1].timestamp;
      const minuteDiff = timeDiff / (60 * 1000);

      if (minuteDiff > 1.5) {
        // Allow some tolerance
        validation.gaps.push({
          from: new Date(sortedData[i - 1].timestamp).toISOString(),
          to: new Date(sortedData[i].timestamp).toISOString(),
          gapMinutes: Math.round(minuteDiff),
        });
      }
    }

    // Check for sufficient data coverage
    if (validation.coverage < 80) {
      validation.issues.push(
        `Low data coverage: ${validation.coverage.toFixed(1)}%`
      );
    }

    if (validation.gaps.length > 10) {
      validation.issues.push(`High number of gaps: ${validation.gaps.length}`);
    }

    // Determine if data quality is acceptable
    validation.isValid =
      validation.coverage >= 70 &&
      validation.latestDataAge <= 10 &&
      validation.gaps.length <= 15;

    console.log(`📊 [VALIDATION] ${cryptoName} Recent Data Quality:
      ✓ Points: ${validation.actualPoints}/${
      validation.expectedPoints
    } (${validation.coverage.toFixed(1)}%)
      ✓ Latest: ${validation.latestDataAge.toFixed(1)} minutes ago
      ✓ Gaps: ${validation.gaps.length}
      ✓ Valid: ${validation.isValid ? "✅ YES" : "❌ NO"}
      ${
        validation.issues.length > 0
          ? `⚠️ Issues: ${validation.issues.join(", ")}`
          : ""
      }`);

    return validation;
  }

  /**
   * Validates data quality for hour-level historical data
   *
   * Performs comprehensive quality assessment on historical hourly data to ensure
   * sufficient data coverage and integrity for long-term trend analysis. Validates:
   * - Historical data coverage (percentage of expected hourly points)
   * - Time span coverage (actual days covered vs expected)
   * - Gap detection in historical data
   * - Overall historical data quality score
   *
   * @param {Array} data - Array of hourly data points
   * @param {string} cryptoName - Name of cryptocurrency for logging purposes
   * @returns {Object} Validation results with quality metrics and recommendations
   */
  validateHistoricalDataQuality(data, cryptoName) {
    const expectedHours = CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS; // 168 hours (7 days)

    const validation = {
      isValid: false,
      actualPoints: data.length,
      expectedPoints: expectedHours,
      coverage: 0,
      gaps: [],
      spanDays: 0,
      issues: [],
    };

    if (!data || data.length === 0) {
      validation.issues.push("No historical data available");
      return validation;
    }

    // Sort data by timestamp
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);

    // Check data coverage
    validation.coverage = (data.length / expectedHours) * 100;

    // Calculate actual time span
    if (sortedData.length > 1) {
      const spanMs =
        sortedData[sortedData.length - 1].timestamp - sortedData[0].timestamp;
      validation.spanDays = spanMs / (1000 * 60 * 60 * 24);
    }

    // Detect hourly gaps
    for (let i = 1; i < sortedData.length; i++) {
      const timeDiff = sortedData[i].timestamp - sortedData[i - 1].timestamp;
      const hourDiff = timeDiff / (60 * 60 * 1000);

      if (hourDiff > 1.5) {
        // Allow some tolerance
        validation.gaps.push({
          from: new Date(sortedData[i - 1].timestamp).toISOString(),
          to: new Date(sortedData[i].timestamp).toISOString(),
          gapHours: Math.round(hourDiff),
        });
      }
    }

    // Check for sufficient data coverage
    if (validation.coverage < 70) {
      validation.issues.push(
        `Low historical coverage: ${validation.coverage.toFixed(1)}%`
      );
    }

    if (validation.spanDays < 5) {
      validation.issues.push(
        `Insufficient time span: ${validation.spanDays.toFixed(1)} days`
      );
    }

    if (validation.gaps.length > 20) {
      validation.issues.push(`High number of gaps: ${validation.gaps.length}`);
    }

    // Determine if data quality is acceptable
    validation.isValid =
      validation.coverage >= 60 &&
      validation.spanDays >= 4 &&
      validation.gaps.length <= 30;

    console.log(`📅 [VALIDATION] ${cryptoName} Historical Data Quality:
      ✓ Points: ${validation.actualPoints}/${
      validation.expectedPoints
    } (${validation.coverage.toFixed(1)}%)
      ✓ Span: ${validation.spanDays.toFixed(1)} days
      ✓ Gaps: ${validation.gaps.length}
      ✓ Valid: ${validation.isValid ? "✅ YES" : "❌ NO"}
      ${
        validation.issues.length > 0
          ? `⚠️ Issues: ${validation.issues.join(", ")}`
          : ""
      }`);

    return validation;
  }

  /**
   * Comprehensive data quality assessment
   *
   * Performs a complete quality assessment across all data types (recent and historical)
   * for both Bitcoin and Ethereum. This method aggregates individual validation results
   * and provides an overall quality score and recommendations for data improvement.
   *
   * @param {Object} cryptoData - The structured cryptocurrency data object
   * @returns {Object} Complete quality assessment with overall scores and recommendations
   */
  assessDataQuality(cryptoData) {
    console.log(
      "🔍 [QUALITY] Performing comprehensive data quality assessment..."
    );

    const assessment = {
      bitcoin: {
        recent: this.validateRecentDataQuality(
          cryptoData.bitcoin.recent,
          "Bitcoin"
        ),
        historical: this.validateHistoricalDataQuality(
          cryptoData.bitcoin.historical,
          "Bitcoin"
        ),
      },
      ethereum: {
        recent: this.validateRecentDataQuality(
          cryptoData.ethereum.recent,
          "Ethereum"
        ),
        historical: this.validateHistoricalDataQuality(
          cryptoData.ethereum.historical,
          "Ethereum"
        ),
      },
      overall: {
        isValid: false,
        score: 0,
        issues: [],
        recommendations: [],
      },
    };

    // Calculate overall quality score (0-100)
    const scores = [
      assessment.bitcoin.recent.coverage,
      assessment.bitcoin.historical.coverage,
      assessment.ethereum.recent.coverage,
      assessment.ethereum.historical.coverage,
    ];
    assessment.overall.score =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Determine overall validity
    assessment.overall.isValid =
      assessment.bitcoin.recent.isValid &&
      assessment.bitcoin.historical.isValid &&
      assessment.ethereum.recent.isValid &&
      assessment.ethereum.historical.isValid;

    // Collect all issues
    const allIssues = [
      ...assessment.bitcoin.recent.issues,
      ...assessment.bitcoin.historical.issues,
      ...assessment.ethereum.recent.issues,
      ...assessment.ethereum.historical.issues,
    ];
    assessment.overall.issues = [...new Set(allIssues)]; // Remove duplicates

    // Generate recommendations
    if (assessment.overall.score < 80) {
      assessment.overall.recommendations.push(
        "Consider increasing data collection frequency"
      );
    }
    if (!assessment.overall.isValid) {
      assessment.overall.recommendations.push(
        "Data quality below acceptable threshold - analysis may be less reliable"
      );
    }

    console.log(`📊 [QUALITY] Overall Assessment:
      ✓ Score: ${assessment.overall.score.toFixed(1)}/100
      ✓ Valid: ${assessment.overall.isValid ? "✅ YES" : "❌ NO"}
      ${
        assessment.overall.issues.length > 0
          ? `⚠️ Issues: ${assessment.overall.issues.length}`
          : ""
      }
      ${
        assessment.overall.recommendations.length > 0
          ? `💡 Recommendations: ${assessment.overall.recommendations.length}`
          : ""
      }`);

    return assessment;
  }

  /**
   * Intelligently extracts the most recent complete minutes of data
   * @param {Array} allData - All available minute-level data
   * @param {number} targetMinutes - Target number of minutes to extract (e.g., 60)
   * @returns {Array} - Optimized minute-level data
   */
  extractRecentMinutes(allData, targetMinutes) {
    if (!allData || allData.length === 0) return [];

    // Sort by timestamp to ensure proper order
    const sortedData = [...allData].sort((a, b) => a.timestamp - b.timestamp);

    // If we have less data than requested, return all of it
    if (sortedData.length <= targetMinutes) {
      return sortedData;
    }

    // Try to get the most complete recent minutes
    // Look for the best continuous block of data near the end
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Filter to data within the last hour and a bit more for safety
    const recentData = sortedData.filter(
      (point) => point.timestamp >= oneHourAgo - 30 * 60 * 1000
    );

    if (recentData.length >= targetMinutes) {
      // Get the most recent targetMinutes points
      return recentData.slice(-targetMinutes);
    } else {
      // Fall back to the most recent data available
      return sortedData.slice(-targetMinutes);
    }
  }

  /**
   * Fetches comprehensive cryptocurrency data for analysis
   *
   * This is the main data fetching method that retrieves both recent minute-level
   * and historical hourly data for Bitcoin and Ethereum. It performs parallel
   * API calls to optimize performance and includes comprehensive data validation.
   *
   * Data Structure Returned:
   * - Recent data: Last 60 minutes of minute-by-minute prices
   * - Historical data: Last 7 days of hourly aggregated OHLC data
   * - Quality assessment: Comprehensive data quality metrics
   *
   * @returns {Object} Structured cryptocurrency data with quality assessment
   */
  async fetchComprehensiveData() {
    try {
      console.log(
        "📊 [DATA] Fetching contextual Bitcoin and Ethereum data (120min→60min minute-level + 7-day hourly)..."
      );

      // Fetch data for both recent minute-level analysis and historical context
      // Request 2 hours for recent data to ensure we get at least 60 minutes
      const [
        bitcoinRecentResponse,
        ethereumRecentResponse,
        bitcoinHistoricalResponse,
        ethereumHistoricalResponse,
      ] = await Promise.all([
        // Recent data: Request 2 hours to ensure we get full 60 minutes
        axios.get(`${CONFIG.DATA_SERVICE_URL}/bitcoin?hours=2`, {
          timeout: 30000,
        }),
        axios.get(`${CONFIG.DATA_SERVICE_URL}/ethereum?hours=2`, {
          timeout: 30000,
        }),
        // Historical data: 7 days of minute data to be aggregated into hourly
        axios.get(
          `${CONFIG.DATA_SERVICE_URL}/bitcoin?hours=${
            CONFIG.DATA_CONTEXT.HISTORICAL_DAYS * 24
          }`,
          { timeout: 30000 }
        ),
        axios.get(
          `${CONFIG.DATA_SERVICE_URL}/ethereum?hours=${
            CONFIG.DATA_CONTEXT.HISTORICAL_DAYS * 24
          }`,
          { timeout: 30000 }
        ),
      ]);

      if (
        !bitcoinRecentResponse.data ||
        !ethereumRecentResponse.data ||
        !bitcoinHistoricalResponse.data ||
        !ethereumHistoricalResponse.data
      ) {
        throw new Error(
          "Incomplete data received from data collection service"
        );
      }

      // Extract recent minute-level data (target: exactly 60 minutes)
      // Smart extraction to get the most recent complete 60 minutes
      const bitcoinAllRecentData = bitcoinRecentResponse.data.data || [];
      const ethereumAllRecentData = ethereumRecentResponse.data.data || [];

      const bitcoinRecentData = this.extractRecentMinutes(
        bitcoinAllRecentData,
        CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS
      );
      const ethereumRecentData = this.extractRecentMinutes(
        ethereumAllRecentData,
        CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS
      );

      // Extract and aggregate historical data to hourly
      const bitcoinHistoricalMinuteData =
        bitcoinHistoricalResponse.data.data || [];
      const ethereumHistoricalMinuteData =
        ethereumHistoricalResponse.data.data || [];

      // Aggregate minute data to hourly data for historical context
      const bitcoinHourlyData = this.aggregateToHourlyData(
        bitcoinHistoricalMinuteData
      ).slice(-CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS); // Last 168 hours (7 days)
      const ethereumHourlyData = this.aggregateToHourlyData(
        ethereumHistoricalMinuteData
      ).slice(-CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS); // Last 168 hours (7 days)

      if (!bitcoinRecentData.length || !ethereumRecentData.length) {
        throw new Error("Empty recent Bitcoin or Ethereum data received");
      }

      // Sort all data by timestamp to ensure chronological order
      bitcoinRecentData.sort((a, b) => a.timestamp - b.timestamp);
      ethereumRecentData.sort((a, b) => a.timestamp - b.timestamp);
      bitcoinHourlyData.sort((a, b) => a.timestamp - b.timestamp);
      ethereumHourlyData.sort((a, b) => a.timestamp - b.timestamp);

      // Enhanced logging for data debugging
      console.log(
        `✅ [DATA] Fetched contextual data:`,
        `\n  📊 Bitcoin: ${bitcoinRecentData.length} recent minutes + ${bitcoinHourlyData.length} historical hours`,
        `\n  📊 Ethereum: ${ethereumRecentData.length} recent minutes + ${ethereumHourlyData.length} historical hours`
      );

      // Debug logging for data completeness
      if (bitcoinRecentData.length < CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS) {
        console.warn(
          `⚠️ [DATA] Bitcoin recent data incomplete: ${bitcoinRecentData.length}/${CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS} points`
        );
        if (bitcoinRecentData.length > 0) {
          const oldestPoint = bitcoinRecentData[0];
          const newestPoint = bitcoinRecentData[bitcoinRecentData.length - 1];
          const spanMinutes =
            (newestPoint.timestamp - oldestPoint.timestamp) / (1000 * 60);
          console.warn(
            `⚠️ [DATA] Bitcoin data span: ${spanMinutes.toFixed(
              1
            )} minutes (${new Date(
              oldestPoint.timestamp
            ).toISOString()} to ${new Date(
              newestPoint.timestamp
            ).toISOString()})`
          );
        }
      }

      if (ethereumRecentData.length < CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS) {
        console.warn(
          `⚠️ [DATA] Ethereum recent data incomplete: ${ethereumRecentData.length}/${CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS} points`
        );
        if (ethereumRecentData.length > 0) {
          const oldestPoint = ethereumRecentData[0];
          const newestPoint = ethereumRecentData[ethereumRecentData.length - 1];
          const spanMinutes =
            (newestPoint.timestamp - oldestPoint.timestamp) / (1000 * 60);
          console.warn(
            `⚠️ [DATA] Ethereum data span: ${spanMinutes.toFixed(
              1
            )} minutes (${new Date(
              oldestPoint.timestamp
            ).toISOString()} to ${new Date(
              newestPoint.timestamp
            ).toISOString()})`
          );
        }
      }

      if (
        bitcoinHourlyData.length < CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS
      ) {
        console.warn(
          `⚠️ [DATA] Bitcoin historical data incomplete: ${bitcoinHourlyData.length}/${CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS} hours`
        );
      }

      if (
        ethereumHourlyData.length < CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS
      ) {
        console.warn(
          `⚠️ [DATA] Ethereum historical data incomplete: ${ethereumHourlyData.length}/${CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS} hours`
        );
      }

      // Create initial data structure for validation
      const cryptoData = {
        bitcoin: {
          recent: bitcoinRecentData, // Last 60 minutes, minute-by-minute
          historical: bitcoinHourlyData, // Last 7 days, hour-by-hour
        },
        ethereum: {
          recent: ethereumRecentData, // Last 60 minutes, minute-by-minute
          historical: ethereumHourlyData, // Last 7 days, hour-by-hour
        },
        timestamp: new Date().toISOString(),
      };

      // Perform comprehensive data quality assessment
      const qualityAssessment = this.assessDataQuality(cryptoData);

      // Add quality assessment to return object
      cryptoData.dataQuality = qualityAssessment;

      // Check if data quality is acceptable for analysis
      if (!qualityAssessment.overall.isValid) {
        console.warn(
          `⚠️ [DATA] Data quality below optimal threshold (${qualityAssessment.overall.score.toFixed(
            1
          )}%) - analysis may be less reliable`
        );
        console.warn(
          `⚠️ [DATA] Issues: ${qualityAssessment.overall.issues.join(", ")}`
        );
        if (qualityAssessment.overall.recommendations.length > 0) {
          console.warn(
            `💡 [DATA] Recommendations: ${qualityAssessment.overall.recommendations.join(
              ", "
            )}`
          );
        }
      }

      return cryptoData;
    } catch (error) {
      console.error("❌ [DATA] Error fetching crypto data:", error.message);
      return {
        bitcoin: { recent: [], historical: [] },
        ethereum: { recent: [], historical: [] },
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Fetches performance analysis inputs for BTC and ETH
   *
   * Retrieves optimized data inputs specifically designed for performance and trend analysis:
   * - 24-hour minute data downsampled to 5-minute resolution for efficiency
   * - ~900 days of daily closing prices from cache for long-term context
   * - Latest price information for current market state
   *
   * This method is optimized for the AI analysis engine and provides the right
   * balance of granularity and performance for trend analysis.
   *
   * @returns {Object} Performance analysis inputs with downsampled data and daily closes
   */
  async fetchPerformanceInputs() {
    try {
      console.log(
        "📊 [DATA] Fetching 24H minute data for BTC/ETH (downsampling to 5m). 900d daily closes served from cache..."
      );

      const [btc24hResp, eth24hResp] = await Promise.all([
        axios.get(`${CONFIG.DATA_SERVICE_URL}/bitcoin?hours=24`, {
          timeout: 30000,
        }),
        axios.get(`${CONFIG.DATA_SERVICE_URL}/ethereum?hours=24`, {
          timeout: 30000,
        }),
      ]);

      const btc24h = (btc24hResp.data?.data || [])
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-24 * 60)
        .map((p) => ({ timestamp: p.timestamp, price: p.price }));
      const eth24h = (eth24hResp.data?.data || [])
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-24 * 60)
        .map((p) => ({ timestamp: p.timestamp, price: p.price }));

      // Downsample to 5-minute resolution for LLM
      const btc24h5m = this.downsampleToFiveMinutes(btc24h);
      const eth24h5m = this.downsampleToFiveMinutes(eth24h);

      // Use cached daily closes; if unavailable, fall back to live fetch
      const btcDaily = await getCachedDailyCloses("bitcoin");
      const ethDaily = await getCachedDailyCloses("ethereum");

      const btcLatest = btc24h[btc24h.length - 1]?.price ?? null;
      const ethLatest = eth24h[eth24h.length - 1]?.price ?? null;

      const inputs = {
        bitcoin: {
          minutes24h: btc24h5m,
          daily900d: btcDaily,
          latestPrice: btcLatest,
        },
        ethereum: {
          minutes24h: eth24h5m,
          daily900d: ethDaily,
          latestPrice: ethLatest,
        },
        timestamp: new Date().toISOString(),
      };

      console.log(
        `✅ [DATA] Ready - BTC: ${btc24h5m.length} x 5m, ${btcDaily.length} daily | ETH: ${eth24h5m.length} x 5m, ${ethDaily.length} daily`
      );
      return inputs;
    } catch (error) {
      console.error("❌ [DATA] fetchPerformanceInputs error:", error.message);
      return {
        bitcoin: { minutes24h: [], daily900d: [] },
        ethereum: { minutes24h: [], daily900d: [] },
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}

/**
 * Performance & Trend Analysis Engine
 *
 * This is the core analysis engine that performs AI-powered performance and trend
 * analysis for Bitcoin and Ethereum. It uses the OpenRouter LLM service to generate
 * sophisticated market insights based on historical and recent price data.
 *
 * Features:
 * - Individual analysis for BTC and ETH (no cross-asset comparisons)
 * - Short-term trend analysis from 24-hour minute data
 * - Long-term trend analysis from ~900 days of daily closes
 * - Momentum signal detection
 * - Notable price level identification
 * - Structured JSON output for easy integration
 *
 * The engine uses carefully crafted prompts to ensure consistent, objective analysis
 * without predictions or causal claims, focusing purely on observable market patterns.
 */
class PerformanceTrendEngine {
  /**
   * Builds the analysis prompt for the LLM
   *
   * Constructs a comprehensive prompt using the prompt management system,
   * incorporating current market data and historical context for both
   * Bitcoin and Ethereum analysis.
   *
   * @param {Object} data - Performance analysis data with BTC/ETH minute and daily data
   * @returns {string} Formatted prompt ready for LLM processing
   */
  buildPrompt(data) {
    const btcMinutes = data.bitcoin.minutes24h;
    const ethMinutes = data.ethereum.minutes24h;
    const btcDaily = data.bitcoin.daily900d;
    const ethDaily = data.ethereum.daily900d;

    const btcCurrentPrice =
      data.bitcoin.latestPrice ??
      btcMinutes[btcMinutes.length - 1]?.price ??
      null;
    const ethCurrentPrice =
      data.ethereum.latestPrice ??
      ethMinutes[ethMinutes.length - 1]?.price ??
      null;

    const templateData = {
      timestamp: new Date().toISOString(),
      btc_current_price: btcCurrentPrice,
      eth_current_price: ethCurrentPrice,
      bitcoin_recent_minutes_24h: JSON.stringify(btcMinutes, null, 2),
      ethereum_recent_minutes_24h: JSON.stringify(ethMinutes, null, 2),
      bitcoin_daily_900d_close: JSON.stringify(btcDaily, null, 2),
      ethereum_daily_900d_close: JSON.stringify(ethDaily, null, 2),
    };

    return promptManager.getFilledPrompt(
      templateData,
      "performance-trend",
      "v1"
    );
  }

  /**
   * Performs AI-powered performance and trend analysis
   *
   * This is the main analysis method that sends the constructed prompt to the
   * OpenRouter LLM service and processes the response. It handles API communication,
   * response parsing, and error handling to ensure reliable analysis results.
   *
   * @param {Object} data - Performance analysis data with BTC/ETH minute and daily data
   * @returns {Object} Analysis results with trend insights and market patterns
   */
  async analyze(data) {
    try {
      console.log("🧠 [PERF] Running BTC/ETH performance & trend analysis...");
      const prompt = this.buildPrompt(data);

      const response = await axios.post(
        `${CONFIG.OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: "openai/gpt-5-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an expert crypto markets analyst. Analyze the performance and trend for Bitcoin and Ethereum individually with rich descriptions of the short-term and long-term trends for each asset separately.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 10000,
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "X-Title": "BTC & ETH Performance/Trend",
          },
          timeout: 60000,
        }
      );

      const content =
        response.data.choices?.[0]?.message?.content?.trim() || "";
      let result;
      try {
        const jsonMatch =
          content.match(/```json\s*([\s\S]*?)\s*```/) ||
          content.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : null;
      } catch (_) {}

      if (!result) {
        result = { error: true, raw: content };
      }
      console.log("✅ [PERF] Analysis complete");
      return result;
    } catch (error) {
      console.error("❌ [PERF] Error in performance analysis:", error.message);
      return { error: true, message: error.message };
    }
  }
}

/**
 * Firestore Storage Manager
 *
 * Manages data persistence in Google Firestore database. This class handles
 * storing analysis results, retrieving historical analyses, and managing
 * the database connection state.
 *
 * Features:
 * - Analysis result storage with timestamps
 * - Historical analysis retrieval
 * - Connection state management
 * - Error handling and logging
 *
 * The service can operate without Firestore if the connection fails,
 * but analysis results won't be persisted for historical reference.
 */
class FirestoreManager {
  /**
   * Stores analysis results in Firestore
   *
   * Saves analysis results to the Firestore database with automatic timestamping
   * and service identification. Handles connection failures gracefully.
   *
   * @param {Object} analysis - Analysis results to store
   * @returns {Object} Storage result with success status and document ID
   */
  async storeAnalysis(analysis) {
    if (!db) {
      console.log(
        "⚠️ [FIRESTORE] Skipping storage - Firestore not initialized"
      );
      return { stored: false, reason: "firestore_not_available" };
    }

    try {
      const docRef = await db.collection("crypto_analyses").add({
        ...analysis,
        createdAt: admin.firestore.Timestamp.now(),
        service: "crypto-data-analysis-service",
      });

      console.log(`✅ [FIRESTORE] Analysis stored with ID: ${docRef.id}`);
      return { stored: true, documentId: docRef.id };
    } catch (error) {
      console.error("❌ [FIRESTORE] Error storing analysis:", error.message);
      return { stored: false, error: error.message };
    }
  }

  /**
   * Retrieves recent analysis results from Firestore
   *
   * Fetches the most recent analysis results from the database, ordered by
   * creation timestamp. Useful for monitoring and historical reference.
   *
   * @param {number} limit - Maximum number of analyses to retrieve (default: 10)
   * @returns {Object} Recent analyses with count and error information
   */
  async getRecentAnalyses(limit = 10) {
    if (!db) {
      return { analyses: [], error: "Firestore not available" };
    }

    try {
      const snapshot = await db
        .collection("crypto_analyses")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const analyses = [];
      snapshot.forEach((doc) => {
        analyses.push({ id: doc.id, ...doc.data() });
      });

      return { analyses };
    } catch (error) {
      console.error("❌ [FIRESTORE] Error fetching analyses:", error.message);
      return { analyses: [], error: error.message };
    }
  }
}

/**
 * Service Component Initialization
 *
 * Initialize all core service components that handle different aspects
 * of the analysis pipeline.
 */
const dataFetcher = new CryptoDataFetcher();
const performanceEngine = new PerformanceTrendEngine();
const firestoreManager = new FirestoreManager();
const promptManager = new PromptManager();

/**
 * Daily Closes Cache
 *
 * In-memory cache for ~900 days of daily closing prices for both Bitcoin and Ethereum.
 * This cache is refreshed at startup and once per day to provide long-term historical
 * context for trend analysis without requiring frequent API calls.
 */
const dailyClosesCache = {
  bitcoin: [],
  ethereum: [],
  lastFetchedAt: 0,
};

/**
 * Refreshes the daily closes cache
 *
 * Fetches ~900 days of daily closing prices for both Bitcoin and Ethereum
 * from the data collection service and updates the in-memory cache.
 * This function is called at startup and scheduled to run daily.
 */
async function refreshDailyClosesCache() {
  try {
    console.log("🔄 [CACHE] Refreshing ~900d daily closes for BTC/ETH...");
    const [btcDailyResp, ethDailyResp] = await Promise.all([
      axios.get(`${CONFIG.DATA_SERVICE_URL}/bitcoin/daily?days=900`, {
        timeout: 30000,
      }),
      axios.get(`${CONFIG.DATA_SERVICE_URL}/ethereum/daily?days=900`, {
        timeout: 30000,
      }),
    ]);

    const mapDailyClose = (arr) =>
      (arr || [])
        .map((d) => ({
          timestamp: d.timestamp,
          close: d.close ?? d.price ?? d.c ?? null,
        }))
        .filter((d) => Number.isFinite(d.close))
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-900);

    dailyClosesCache.bitcoin = mapDailyClose(btcDailyResp.data?.data);
    dailyClosesCache.ethereum = mapDailyClose(ethDailyResp.data?.data);
    dailyClosesCache.lastFetchedAt = Date.now();
    console.log(
      `✅ [CACHE] Daily closes ready - BTC: ${dailyClosesCache.bitcoin.length}, ETH: ${dailyClosesCache.ethereum.length}`
    );
  } catch (error) {
    console.error("❌ [CACHE] Failed to refresh daily closes:", error.message);
  }
}

/**
 * Retrieves cached daily closes for a specific cryptocurrency
 *
 * Returns the cached daily closing prices for the specified cryptocurrency.
 * If the cache is empty, attempts to refresh it before returning.
 *
 * @param {string} symbol - Cryptocurrency symbol ('bitcoin' or 'ethereum')
 * @returns {Array} Array of daily closing price data
 */
async function getCachedDailyCloses(symbol) {
  const key = symbol === "ethereum" ? "ethereum" : "bitcoin";
  const cached = dailyClosesCache[key];
  if (cached && cached.length > 0) return cached;
  // Fallback: try to refresh once synchronously
  await refreshDailyClosesCache();
  return dailyClosesCache[key] || [];
}

/**
 * Main Analysis Loop
 *
 * The core analysis loop that runs on a scheduled basis to perform
 * performance and trend analysis for Bitcoin and Ethereum. This function:
 *
 * 1. Fetches current market data and performance inputs
 * 2. Runs AI-powered trend analysis
 * 3. Stores results in Firestore
 * 4. Updates analysis state and monitoring data
 *
 * The loop includes concurrency protection to prevent overlapping runs
 * and comprehensive error handling to ensure service stability.
 */
async function runAnomalyDetectionLoop() {
  if (analysisState.isRunning) {
    console.log("ℹ️ [LOOP] Analysis already running, skipping cycle");
    return;
  }

  analysisState.isRunning = true;

  try {
    console.log("🔄 [LOOP] Starting BTC/ETH performance trend analysis...");

    // Fetch new performance inputs (24H minutes + 900d daily)
    const perfInputs = await dataFetcher.fetchPerformanceInputs();
    if (perfInputs.error) {
      console.log("⚠️ [LOOP] Skipping cycle due to data fetch error");
      return;
    }

    const btcPrice = perfInputs.bitcoin.minutes24h.slice(-1)[0]?.price;
    const ethPrice = perfInputs.ethereum.minutes24h.slice(-1)[0]?.price;
    console.log(
      `📊 [LOOP] BTC: $${btcPrice?.toLocaleString() || "N/A"}, ETH: $${
        ethPrice?.toLocaleString() || "N/A"
      }`
    );

    // Run performance/trend analysis
    const perfResults = await performanceEngine.analyze(perfInputs);

    // Store results in Firestore
    const storageResult = await firestoreManager.storeAnalysis(perfResults);

    // Update analysis state
    analysisState.lastAnalysisTime = Date.now();
    analysisState.totalAnalyses++;
    analysisState.recentAnalyses.unshift({
      timestamp: new Date().toISOString(),
      behaviorPattern:
        perfResults?.bitcoin?.trend_summary || perfResults.behavior || "n/a",
      correlationStatus: "n/a",
      stored: storageResult.stored,
    });

    // Keep only last 10 analyses
    if (analysisState.recentAnalyses.length > 10) {
      analysisState.recentAnalyses = analysisState.recentAnalyses.slice(0, 10);
    }

    console.log(
      `✅ [LOOP] Performance analysis complete - Total analyses: ${analysisState.totalAnalyses}`
    );
  } catch (error) {
    console.error("❌ [LOOP] Error in analysis loop:", error.message);
  } finally {
    analysisState.isRunning = false;
  }
}

/**
 * API Routes
 *
 * RESTful API endpoints for service monitoring, data access, and manual analysis triggers.
 * All endpoints include comprehensive error handling and structured JSON responses.
 */

/**
 * Health Check Endpoint
 *
 * Provides basic service information and status for monitoring and health checks.
 * This endpoint is typically used by load balancers and monitoring systems.
 */
app.get("/", (req, res) => {
  res.json({
    service: "BTC/ETH Performance & Trend Analysis Service",
    version: "1.0.0",
    status: "operational",
    description:
      "Provides per-asset BTC & ETH performance/trend analysis using 24H minute-by-minute prices and ~900d daily close series",
    focus: [
      "BTC/ETH performance & trend",
      "24H minute-level + ~900d daily closes",
      "Per-asset analysis only (no cross-asset factors)",
    ],
    timestamp: new Date().toISOString(),
  });
});

/**
 * Service Status Endpoint
 *
 * Provides detailed service status including analysis state, configuration,
 * and integration status. Useful for monitoring and debugging.
 */
app.get("/api/status", (req, res) => {
  res.json({
    status: "operational",
    uptime: process.uptime(),
    analysisState: {
      ...analysisState,
      lastAnalysisAgo: analysisState.lastAnalysisTime
        ? `${(
            (Date.now() - analysisState.lastAnalysisTime) /
            (1000 * 60)
          ).toFixed(1)} minutes`
        : "never",
    },
    config: {
      dataContext: CONFIG.DATA_CONTEXT,
      analysisInterval: "Every 5 minutes",
    },
    integrations: {
      firestore: !!db,
      openrouter: !!CONFIG.OPENROUTER_API_KEY,
      dataService: !!CONFIG.DATA_SERVICE_URL,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Data Quality Assessment Endpoint
 *
 * Performs comprehensive data quality assessment for both Bitcoin and Ethereum data.
 * Returns detailed quality metrics, coverage statistics, and recommendations.
 */
app.get("/api/data-quality", async (req, res) => {
  try {
    console.log("📊 [API] Data quality assessment requested");

    // Fetch comprehensive data
    const cryptoData = await dataFetcher.fetchComprehensiveData();

    if (cryptoData.error) {
      return res.status(500).json({
        error: "Data fetch failed for quality assessment",
        message: cryptoData.error,
        timestamp: new Date().toISOString(),
      });
    }

    // Return comprehensive quality assessment
    res.json({
      success: true,
      dataQuality: cryptoData.dataQuality,
      dataStructure: {
        recentGranularity: "minute-by-minute (last 60 minutes)",
        historicalGranularity: "hour-by-hour (last 7 days)",
        multiTimeframeAnalysis:
          "1h, 6h, 24h, 7d price changes with correlation insights",
        expectedPoints: {
          bitcoinRecent: CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS,
          bitcoinHistorical: CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS,
          ethereumRecent: CONFIG.DATA_CONTEXT.MAX_RECENT_POINTS,
          ethereumHistorical: CONFIG.DATA_CONTEXT.MAX_HISTORICAL_POINTS,
        },
      },
      qualityThresholds: {
        recentDataMinCoverage: "70%",
        historicalDataMinCoverage: "60%",
        maxLatestDataAge: "10 minutes",
        maxRecentGaps: 15,
        maxHistoricalGaps: 30,
        minHistoricalSpan: "4 days",
      },
      recommendations: cryptoData.dataQuality.overall.recommendations,
      currentData: {
        bitcoin: {
          recentPoints: cryptoData.bitcoin.recent.length,
          historicalPoints: cryptoData.bitcoin.historical.length,
        },
        ethereum: {
          recentPoints: cryptoData.ethereum.recent.length,
          historicalPoints: cryptoData.ethereum.historical.length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ [API] Error in data quality assessment:", error.message);
    res.status(500).json({
      error: "Data quality assessment failed",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Manual Analysis Trigger Endpoint
 *
 * Allows manual triggering of performance and trend analysis for immediate results.
 * Useful for testing, debugging, or on-demand analysis requests.
 */
app.post("/api/analyze", async (req, res) => {
  try {
    console.log("🎯 [API] Manual performance analysis triggered");

    // Fetch performance inputs (24H minutes + ~900d daily closes)
    const inputs = await dataFetcher.fetchPerformanceInputs();
    if (inputs.error) {
      return res.status(500).json({
        error: "Data fetch failed",
        message: inputs.error,
      });
    }

    // Run performance/trend analysis
    const perfResults = await performanceEngine.analyze(inputs);

    // Store results
    const storageResult = await firestoreManager.storeAnalysis(perfResults);

    // Update state
    analysisState.lastAnalysisTime = Date.now();
    analysisState.totalAnalyses++;

    res.json({
      success: true,
      analysis: perfResults,
      inputCounts: {
        btc_minutes24h: inputs.bitcoin.minutes24h.length,
        btc_daily: inputs.bitcoin.daily900d.length,
        eth_minutes24h: inputs.ethereum.minutes24h.length,
        eth_daily: inputs.ethereum.daily900d.length,
      },
      stored: storageResult.stored,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "❌ [API] Error in manual performance analysis:",
      error.message
    );
    res.status(500).json({
      error: "Analysis failed",
      message: error.message,
    });
  }
});

/**
 * Recent Analyses Endpoint
 *
 * Retrieves recent analysis results from Firestore database.
 * Supports pagination through the limit query parameter.
 */
app.get("/api/analyses", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await firestoreManager.getRecentAnalyses(limit);

    res.json({
      success: true,
      analyses: result.analyses,
      count: result.analyses.length,
      error: result.error || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ [API] Error fetching analyses:", error.message);
    res.status(500).json({
      error: "Failed to fetch analyses",
      message: error.message,
    });
  }
});

/**
 * Current Crypto Data Endpoint
 *
 * Provides current cryptocurrency data including recent prices, historical data,
 * and data quality information for both Bitcoin and Ethereum.
 */
app.get("/api/crypto-data", async (req, res) => {
  try {
    const cryptoData = await dataFetcher.fetchComprehensiveData();

    res.json({
      success: true,
      currentPrices: {
        bitcoin:
          cryptoData.bitcoin.recent[cryptoData.bitcoin.recent.length - 1]
            ?.price,
        ethereum:
          cryptoData.ethereum.recent[cryptoData.ethereum.recent.length - 1]
            ?.price,
      },
      recentData: {
        bitcoin: cryptoData.bitcoin.recent.slice(-10), // Last 10 minutes
        ethereum: cryptoData.ethereum.recent.slice(-10), // Last 10 minutes
      },
      historicalData: {
        bitcoin: cryptoData.bitcoin.historical.slice(-24), // Last 24 hours
        ethereum: cryptoData.ethereum.historical.slice(-24), // Last 24 hours
      },
      dataStructure: {
        recentGranularity: "minute-by-minute (last 60 minutes)",
        historicalGranularity: "hour-by-hour (last 7 days)",
        multiTimeframeAnalysis:
          "1h, 6h, 24h, 7d price changes with correlation insights",
        bitcoinDataQuality: cryptoData.dataQuality.bitcoin,
        ethereumDataQuality: cryptoData.dataQuality.ethereum,
      },
      timestamp: cryptoData.timestamp,
    });
  } catch (error) {
    console.error("❌ [API] Error fetching crypto data:", error.message);
    res.status(500).json({
      error: "Failed to fetch crypto data",
      message: error.message,
    });
  }
});

/**
 * Global Error Handling Middleware
 *
 * Catches and handles any unhandled errors in the Express.js application.
 * Provides appropriate error responses based on the environment (development vs production).
 */
app.use((error, req, res, next) => {
  console.error("❌ [SERVER] Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

/**
 * 404 Not Found Handler
 *
 * Handles requests to non-existent endpoints with appropriate error response.
 */
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    message: "The requested endpoint does not exist",
  });
});

/**
 * Service Startup and Scheduling
 *
 * Initializes the service with cache priming and scheduled tasks.
 * The service runs automated analysis on a regular schedule and maintains
 * daily cache refreshes for optimal performance.
 */

// Service startup logging
console.log(
  "🚀 [STARTUP] Starting BTC/ETH Performance & Trend Analysis Service..."
);

// Prime daily closes cache at startup for immediate availability
refreshDailyClosesCache();

// Schedule daily refresh of ~900d daily closes at 00:05 (5 minutes past midnight)
cron.schedule("5 0 * * *", refreshDailyClosesCache);

// Schedule automated analysis to run 2 minutes before every hour (00:58, 01:58, 02:58, etc.)
// This timing ensures analysis runs with fresh data while avoiding peak API usage
cron.schedule("58 * * * *", runAnomalyDetectionLoop);

/**
 * Server Startup
 *
 * Starts the Express.js server and logs comprehensive startup information
 * including service configuration, analysis schedule, and integration status.
 */
const server = app.listen(CONFIG.PORT, () => {
  console.log(
    `✅ [SERVER] BTC/ETH Performance & Trend Analysis Service running on port ${CONFIG.PORT}`
  );
  console.log(
    `🎯 [SCHEDULE] Automated analysis runs 2 minutes before every hour (58 minutes past)`
  );
  console.log(
    `🧠 [LLM] AI Analysis: ${
      CONFIG.OPENROUTER_API_KEY ? "Enabled" : "Disabled (API key required)"
    }`
  );
  console.log(
    `💾 [STORAGE] Firestore integration: ${
      db ? "Enabled" : "Disabled (serviceAccountKey.json required)"
    }`
  );
});

/**
 * Graceful Shutdown Handlers
 *
 * Handles graceful shutdown of the service when receiving termination signals.
 * Ensures proper cleanup of resources and connections before exiting.
 */

// Handle SIGTERM signal (typically sent by process managers like PM2)
process.on("SIGTERM", () => {
  console.log("🛑 [SHUTDOWN] Received SIGTERM, shutting down gracefully...");
  server.close(() => {
    console.log("✅ [SHUTDOWN] Server closed");
    process.exit(0);
  });
});

// Handle SIGINT signal (typically sent by Ctrl+C)
process.on("SIGINT", () => {
  console.log("🛑 [SHUTDOWN] Received SIGINT, shutting down gracefully...");
  server.close(() => {
    console.log("✅ [SHUTDOWN] Server closed");
    process.exit(0);
  });
});

module.exports = app;
