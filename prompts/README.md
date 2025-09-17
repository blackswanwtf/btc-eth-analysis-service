# Prompt Management System

This directory contains versioned prompts for the BTC/ETH analysis service (anomaly detection and performance/trend), making them easy to version control, edit, and manage.

## File Structure

```
prompts/
├── performance-trend-v1.md     # Current template (repurposed for BTC/ETH performance & trend)
├── prompt-config.js            # Prompt management system
└── README.md                   # This file
```

## Usage

### Using Different Prompt Versions

```javascript
// Use current version (default)
const prompt = promptManager.getFilledPrompt(templateData);

// Use specific version
const prompt = promptManager.getFilledPrompt(
  templateData,
  "performance-trend",
  "v1"
);
```

### Creating New Prompt Versions

1. **Copy existing version**: `cp performance-trend-v1.md performance-trend-v2.md`
2. **Edit the new version**: Modify the template as needed
3. **Update default version**:
   ```javascript
   promptManager.setDefaultVersion("v2");
   ```

### Template Variables

The prompt template uses `{{variable_name}}` syntax for placeholders:

- `{{timestamp}}` - Current analysis timestamp
- `{{btc_current_price}}` / `{{eth_current_price}}` - Latest prices
- `{{bitcoin_recent_minutes_24h}}` / `{{ethereum_recent_minutes_24h}}` - 24H minute-by-minute prices
- `{{bitcoin_daily_900d_close}}` / `{{ethereum_daily_900d_close}}` - ~900d daily close series

## Benefits

✅ **Version Control**: Easy to track prompt changes over time
✅ **Easy Editing**: Edit prompts in markdown without touching code
✅ **Testing**: Test different prompt versions without code changes
✅ **Rollback**: Quickly revert to previous prompt versions
✅ **Team Collaboration**: Non-developers can edit prompts
✅ **A/B Testing**: Compare different prompt versions

## Available Commands

```javascript
// List available versions
promptManager.getAvailableVersions("performance-trend");

// Clear cache (useful in development)
promptManager.clearCache();

// Set default version
promptManager.setDefaultVersion("v2");
```

## Adding New Prompt Types

To add a new prompt type (e.g., for risk assessment):

1. Create `risk-assessment-v1.md`
2. Use in code: `promptManager.getFilledPrompt(data, 'risk-assessment', 'v1')`
