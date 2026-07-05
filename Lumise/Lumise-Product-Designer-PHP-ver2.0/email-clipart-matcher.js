/**
 * Email Clipart Matcher — Smart clipart suggestions for email campaigns
 * Works with Brevo, Mailchimp, SendGrid, or any email platform
 *
 * Usage:
 *   const matcher = new EmailClipartMatcher('/path/to/cliparts');
 *   const suggestions = matcher.matchEmail({
 *     subject: "Summer Sale - 50% Off!",
 *     content: "Get ready for graduation season...",
 *     maxImages: 3
 *   });
 */

class EmailClipartMatcher {
  constructor(clipartBasePath) {
    this.basePath = clipartBasePath;

    // Category keywords for smart matching
    this.categoryKeywords = {
      'alphabets-monograms': ['letter', 'initial', 'monogram', 'alphabet', 'name', 'personalized'],
      'adult-humor': ['funny', 'sarcastic', 'humor', 'joke', 'laugh', 'wtf', 'sassy'],
      'animals': ['pet', 'dog', 'cat', 'bird', 'animal', 'wildlife', 'zoo', 'paw'],
      'backgrounds': ['texture', 'pattern', 'background', 'glitter', 'sparkle', 'design'],
      'birthday': ['birthday', 'bday', 'party', 'celebrate', 'age', 'turning', 'sonic'],
      'black-culture': ['black', 'african american', 'culture', 'heritage', 'pride'],
      'black-history': ['mlk', 'history', 'civil rights', 'heritage month', 'julian'],
      'christmas': ['christmas', 'xmas', 'holiday', 'santa', 'winter', 'snow'],
      'faith-inspiration': ['faith', 'pray', 'god', 'church', 'blessed', 'cross', 'spiritual'],
      'family': ['family', 'mom', 'dad', 'cousin', 'reunion', 'gender reveal', 'aunt'],
      'girl-power': ['queen', 'crown', 'diva', 'fabulous', 'girl', 'woman', 'ladies'],
      'graduation': ['graduation', 'grad', 'graduate', 'senior', 'class of', 'diploma'],
      'halloween': ['halloween', 'spooky', 'trick or treat', 'costume', 'pumpkin', 'ghost'],
      'hustle-motivation': ['hustle', 'grind', 'motivation', 'money', 'boss', 'entrepreneur'],
      'love-romance': ['love', 'valentine', 'heart', 'romance', 'wedding', 'anniversary'],
      'peekaboo-kids': ['kid', 'children', 'baby', 'toddler', 'child', 'bunny', 'easter'],
      'people': ['person', 'people', 'human', 'man', 'woman', 'hand'],
      'sarcastic-funny': ['sarcasm', 'sarcastic', 'funny', 'humor', 'overthink', 'mood'],
      'shapes': ['star', 'shape', 'frame', 'border', 'icon', 'symbol', 'crown'],
      'sports': ['sports', 'soccer', 'basketball', 'football', 'racing', 'volleyball'],
      'vehicles': ['car', 'truck', 'vehicle', 'ship', 'cruise', 'road'],
      'wine-drinks': ['wine', 'drink', 'alcohol', 'beer', 'cocktail', 'party', 'shots']
    };

    // Season/timing keywords
    this.seasonalKeywords = {
      spring: ['spring', 'easter', 'april', 'may'],
      summer: ['summer', 'june', 'july', 'august', 'vacation'],
      fall: ['fall', 'autumn', 'september', 'october', 'thanksgiving'],
      winter: ['winter', 'december', 'january', 'february', 'christmas', 'snow'],
      graduation: ['may', 'june', 'graduation', 'senior'],
      halloween: ['october', 'halloween'],
      christmas: ['november', 'december', 'christmas', 'holiday']
    };
  }

  /**
   * Match email content to relevant clipart categories
   * @param {Object} options
   * @param {string} options.subject - Email subject line
   * @param {string} options.content - Email HTML or plain text content
   * @param {number} options.maxImages - Maximum number of images to suggest
   * @param {number} options.minScore - Minimum relevance score (0-1)
   * @returns {Array} Suggested cliparts with scores
   */
  matchEmail({ subject = '', content = '', maxImages = 3, minScore = 0.3 }) {
    const text = `${subject} ${content}`.toLowerCase();
    const scores = {};

    // Score each category
    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      let score = 0;
      let matchedKeywords = [];

      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\w*\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length * (keyword.length > 6 ? 1.5 : 1); // Longer keywords = more specific
          matchedKeywords.push(keyword);
        }
      }

      if (score > 0) {
        scores[category] = {
          score,
          matchedKeywords,
          category
        };
      }
    }

    // Seasonal boost
    const month = new Date().getMonth() + 1; // 1-12
    for (const [season, keywords] of Object.entries(this.seasonalKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          // Boost related categories
          if (season === 'christmas' && scores['christmas']) scores['christmas'].score *= 2;
          if (season === 'halloween' && scores['halloween']) scores['halloween'].score *= 2;
          if (season === 'graduation' && scores['graduation']) scores['graduation'].score *= 2;
        }
      }
    }

    // Sort by score and filter
    const suggestions = Object.values(scores)
      .map(s => ({ ...s, normalizedScore: Math.min(1, s.score / 10) }))
      .filter(s => s.normalizedScore >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxImages);

    return suggestions;
  }

  /**
   * Get random clipart from a category
   * @param {string} category - Category name
   * @param {number} count - Number of random cliparts to get
   * @returns {Array} File paths
   */
  getRandomFromCategory(category, count = 1) {
    // This would need filesystem access in Node.js
    // For now, return placeholder paths
    return Array(count).fill(null).map((_, i) =>
      `${this.basePath}/${category}/random-${i}.png`
    );
  }

  /**
   * Build email template with clipart
   * @param {Object} options
   * @param {string} options.subject - Email subject
   * @param {string} options.content - Email content
   * @param {string} options.headerCategory - Force specific category for header image
   * @param {boolean} options.autoInsert - Auto-insert images into content
   * @returns {Object} Template with image suggestions
   */
  buildTemplate({ subject, content, headerCategory = null, autoInsert = false }) {
    const suggestions = this.matchEmail({ subject, content, maxImages: 3 });

    let template = {
      subject,
      suggestions,
      headerImage: null,
      inlineImages: [],
      html: content
    };

    // Add header image if strong match
    if (suggestions.length > 0) {
      const topMatch = suggestions[0];
      if (topMatch.normalizedScore > 0.6 || headerCategory) {
        const cat = headerCategory || topMatch.category;
        template.headerImage = {
          category: cat,
          path: this.getRandomFromCategory(cat, 1)[0],
          alt: `${cat} clipart`,
          matchScore: topMatch.normalizedScore
        };
      }
    }

    // Auto-insert inline images
    if (autoInsert && suggestions.length > 1) {
      for (let i = 1; i < suggestions.length && i < 3; i++) {
        const match = suggestions[i];
        template.inlineImages.push({
          category: match.category,
          path: this.getRandomFromCategory(match.category, 1)[0],
          alt: `${match.category} clipart`,
          matchScore: match.normalizedScore
        });
      }
    }

    return template;
  }

  /**
   * Export for Brevo HTML
   * @param {Object} template - Output from buildTemplate()
   * @param {string} uploadedHeaderUrl - Uploaded header image URL
   * @param {Array} uploadedInlineUrls - Uploaded inline image URLs
   * @returns {string} HTML with images inserted
   */
  toBrevoHTML(template, uploadedHeaderUrl = null, uploadedInlineUrls = []) {
    let html = template.html;

    // Insert header
    if (uploadedHeaderUrl && template.headerImage) {
      const headerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
          <img src="${uploadedHeaderUrl}" alt="${template.headerImage.alt}"
               style="max-width:600px; height:auto; display:block; margin:0 auto;">
        </div>
      `;
      html = headerHTML + html;
    }

    // Insert inline images
    uploadedInlineUrls.forEach((url, i) => {
      if (template.inlineImages[i]) {
        const inlineHTML = `
          <div style="text-align:center; margin:15px 0;">
            <img src="${url}" alt="${template.inlineImages[i].alt}"
                 style="max-width:400px; height:auto; display:block; margin:0 auto;">
          </div>
        `;
        // Insert after first paragraph if possible
        const firstP = html.indexOf('</p>');
        if (firstP > -1) {
          html = html.slice(0, firstP + 4) + inlineHTML + html.slice(firstP + 4);
        } else {
          html += inlineHTML;
        }
      }
    });

    return html;
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailClipartMatcher;
}

// Export for browser
if (typeof window !== 'undefined') {
  window.EmailClipartMatcher = EmailClipartMatcher;
}
