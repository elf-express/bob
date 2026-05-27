/**
 * Lightweight i18n Loader for BOB Tools
 * No framework dependencies - pure vanilla JavaScript
 * Supports: en-US, zh-CN, zh-TW
 * Features: Browser language detection, dynamic loading, fallback
 */

class I18n {
  constructor() {
    this.supportedLanguages = ['en-US', 'zh-CN', 'zh-TW'];
    this.defaultLanguage = 'en-US';
    this.currentLanguage = '';
    this.messages = {};
    this.fallbackMessages = {};
  }

  /**
   * Initialize i18n system
   * @param {Object} options - Configuration options
   * @param {string} options.defaultLanguage - Default language (default: 'en-US')
   * @param {boolean} options.detectBrowserLanguage - Auto-detect browser language (default: true)
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    const {
      defaultLanguage = 'en-US',
      detectBrowserLanguage = true,
    } = options;

    this.defaultLanguage = defaultLanguage;

    // Detect language priority:
    // 1. URL parameter (?lang=en-US)
    // 2. localStorage saved preference
    // 3. Browser language
    // 4. Default language
    const urlLang = this.getLanguageFromUrl();
    const savedLang = this.getLanguageFromStorage();
    const browserLang = detectBrowserLanguage ? this.detectBrowserLanguage() : null;

    const targetLang = urlLang || savedLang || browserLang || defaultLanguage;

    // Load language
    await this.setLanguage(targetLang);
  }

  /**
   * Detect browser language
   * @returns {string|null}
   */
  detectBrowserLanguage() {
    // Get browser language
    const browserLang = navigator.language || navigator.userLanguage;

    // Map browser language to supported language
    const langMap = {
      'en': 'en-US',
      'en-US': 'en-US',
      'en-GB': 'en-US',
      'zh': 'zh-CN',
      'zh-CN': 'zh-CN',
      'zh-Hans': 'zh-CN',
      'zh-TW': 'zh-TW',
      'zh-HK': 'zh-TW',
      'zh-Hant': 'zh-TW',
    };

    // Try exact match first
    if (langMap[browserLang]) {
      return langMap[browserLang];
    }

    // Try partial match (e.g., 'zh-SG' → 'zh-CN')
    const langPrefix = browserLang.split('-')[0];
    if (langMap[langPrefix]) {
      return langMap[langPrefix];
    }

    return null;
  }

  /**
   * Get language from URL parameter
   * @returns {string|null}
   */
  getLanguageFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang');
    return lang && this.supportedLanguages.includes(lang) ? lang : null;
  }

  /**
   * Get language from localStorage
   * @returns {string|null}
   */
  getLanguageFromStorage() {
    try {
      const lang = localStorage.getItem('bob-tools-language');
      return lang && this.supportedLanguages.includes(lang) ? lang : null;
    } catch {
      return null;
    }
  }

  /**
   * Save language to localStorage
   * @param {string} lang
   */
  saveLanguageToStorage(lang) {
    try {
      localStorage.setItem('bob-tools-language', lang);
    } catch (error) {
      console.warn('[i18n] Failed to save language preference:', error);
    }
  }

  /**
   * Set current language
   * @param {string} lang
   * @returns {Promise<boolean>}
   */
  async setLanguage(lang) {
    // Validate language
    if (!this.supportedLanguages.includes(lang)) {
      console.warn(`[i18n] Unsupported language: ${lang}, falling back to ${this.defaultLanguage}`);
      lang = this.defaultLanguage;
    }

    // Skip if already loaded
    if (this.currentLanguage === lang && Object.keys(this.messages).length > 0) {
      return true;
    }

    try {
      // Load messages
      const messages = await this.loadMessages(lang);
      this.messages = messages;
      this.currentLanguage = lang;

      // Load fallback messages (default language)
      if (lang !== this.defaultLanguage) {
        this.fallbackMessages = await this.loadMessages(this.defaultLanguage);
      }

      // Save preference
      this.saveLanguageToStorage(lang);

      // Update HTML lang attribute
      document.documentElement.setAttribute('lang', lang);

      // Emit language changed event
      window.dispatchEvent(new CustomEvent('languageChanged', {
        detail: { language: lang },
      }));

      return true;
    } catch (error) {
      console.error('[i18n] Failed to load language:', error);

      // Try fallback to default language
      if (lang !== this.defaultLanguage) {
        console.warn(`[i18n] Falling back to ${this.defaultLanguage}`);
        return await this.setLanguage(this.defaultLanguage);
      }

      return false;
    }
  }

  /**
   * Load messages from JSON file
   * @param {string} lang
   * @returns {Promise<Object>}
   */
  async loadMessages(lang) {
    const response = await fetch(`/locales/${lang}/common.json`);

    if (!response.ok) {
      throw new Error(`Failed to load messages for ${lang}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Translate a key
   * @param {string} key - Translation key (e.g., 'app.title')
   * @param {Object} params - Parameters for interpolation (e.g., { name: 'John' })
   * @returns {string}
   */
  t(key, params = {}) {
    // Get value from messages
    let value = this.getNestedValue(this.messages, key);

    // Fallback to default language
    if (value === undefined && this.fallbackMessages) {
      value = this.getNestedValue(this.fallbackMessages, key);
    }

    // Treat undefined-like placeholders as missing values
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' &&
        ['undefined', 'null', ''].includes(value.trim().toLowerCase()))
    ) {
      value = undefined;
    }

    // Fallback to key itself
    if (value === undefined) {
      console.warn(`[i18n] Missing translation for key: ${key}`);
      return key;
    }

    // Interpolate parameters
    return this.interpolate(value, params);
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj
   * @param {string} path - Dot-notation path (e.g., 'app.title')
   * @returns {*}
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Interpolate parameters in string
   * @param {string} str - String with placeholders (e.g., 'Hello {name}')
   * @param {Object} params - Parameters (e.g., { name: 'John' })
   * @returns {string}
   */
  interpolate(str, params) {
    return String(str).replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }

  /**
   * Get current language
   * @returns {string}
   */
  getLanguage() {
    return this.currentLanguage;
  }

  /**
   * Get all supported languages
   * @returns {Array<string>}
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  /**
   * Get language display name
   * @param {string} lang
   * @returns {string}
   */
  getLanguageName(lang) {
    const names = {
      'en-US': 'English',
      'zh-CN': 'Simplified Chinese',
      'zh-TW': 'Traditional Chinese',
    };
    return names[lang] || lang;
  }
}

// Create global instance
const i18n = new I18n();

// Shorthand function
const $t = (key, params) => i18n.t(key, params);

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { i18n, $t };
}
