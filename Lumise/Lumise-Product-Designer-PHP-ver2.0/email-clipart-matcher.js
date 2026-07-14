/**
 * Universal Email Clipart Matcher
 * Platform-agnostic — works with any email service (Brevo, Mailchimp, SendGrid, etc.)
 *
 * Usage:
 *   import { EmailClipartMatcher } from './email-clipart-matcher.js';
 *   const matcher = new EmailClipartMatcher('./lumise/assets/clipart-seeds/png');
 *   const suggestions = await matcher.match({ subject, content });
 */

import { readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

export class EmailClipartMatcher {
  constructor(clipartBasePath) {
    this.basePath = clipartBasePath;

    // Category → keywords mapping
    this.categoryKeywords = {
      'alphabets-monograms': ['letter', 'initial', 'monogram', 'alphabet', 'name', 'personalized'],
      'adult-humor': ['funny', 'sarcastic', 'humor', 'joke', 'laugh', 'wtf', 'sassy'],
      'animals': ['pet', 'dog', 'cat', 'bird', 'animal', 'wildlife', 'zoo', 'paw'],
      'backgrounds': ['texture', 'pattern', 'background', 'glitter', 'sparkle', 'design'],
      'birthday': ['birthday', 'bday', 'party', 'celebrate', 'age', 'turning'],
      'black-culture': ['black', 'african american', 'culture', 'heritage', 'pride'],
      'black-history': ['mlk', 'history', 'civil rights', 'heritage month'],
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
      'shapes': ['star', 'shape', 'frame', 'border', 'icon', 'symbol'],
      'sports': ['sports', 'soccer', 'basketball', 'football', 'racing', 'volleyball'],
      'vehicles': ['car', 'truck', 'vehicle', 'ship', 'cruise', 'road'],
      'wine-drinks': ['wine', 'drink', 'alcohol', 'beer', 'cocktail', 'party', 'shots']
    };
  }

  /**
   * Match cliparts to email content
   * @param {Object} options
   * @param {string} options.subject - Email subject line
   * @param {string} options.content - Email body (HTML or plain text)
   * @param {number} options.maxResults - Max cliparts to return
   * @param {number} options.minScore - Minimum relevance score (0-1)
   * @returns {Promise<Array>} Matched cliparts with file paths
   */
  async match({ subject = '', content = '', maxResults = 3, minScore = 0.3 }) {
    const text = `${subject} ${content.replace(/<[^>]*>/g, '')}`.toLowerCase();
    const scores = new Map();

    // Score each category
    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      let score = 0;
      const matched = new Set();

      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\w*\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length * (keyword.length > 6 ? 1.5 : 1);
          matched.add(keyword);
        }
      }

      if (score > 0) {
        scores.set(category, {
          category,
          score,
          normalizedScore: Math.min(1, score / 10),
          keywords: Array.from(matched)
        });
      }
    }

    // Seasonal boost
    const month = new Date().getMonth() + 1;
    if ((month === 11 || month === 12) && scores.has('christmas')) {
      const entry = scores.get('christmas');
      entry.score *= 2;
      entry.normalizedScore = Math.min(1, entry.score / 10);
    }
    if (month === 10 && scores.has('halloween')) {
      const entry = scores.get('halloween');
      entry.score *= 2;
      entry.normalizedScore = Math.min(1, entry.score / 10);
    }
    if ((month === 5 || month === 6) && scores.has('graduation')) {
      const entry = scores.get('graduation');
      entry.score *= 2;
      entry.normalizedScore = Math.min(1, entry.score / 10);
    }

    // Filter, sort, and add file paths
    const suggestions = Array.from(scores.values())
      .filter(s => s.normalizedScore >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    // Add random file from each category
    for (const suggestion of suggestions) {
      const files = this.getCategoryFiles(suggestion.category);
      if (files.length > 0) {
        suggestion.file = files[Math.floor(Math.random() * files.length)];
        suggestion.fileName = basename(suggestion.file);
      }
    }

    return suggestions;
  }

  /**
   * Get all PNG files in a category
   */
  getCategoryFiles(category) {
    const dir = join(this.basePath, category);
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.png'))
        .map(f => join(dir, f));
    } catch {
      return [];
    }
  }

  /**
   * Get all available categories with file counts
   */
  getCategories() {
    try {
      return readdirSync(this.basePath)
        .map(cat => {
          const path = join(this.basePath, cat);
          if (statSync(path).isDirectory()) {
            const files = this.getCategoryFiles(cat);
            return { category: cat, count: files.length };
          }
          return null;
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Build email HTML with matched images
   * @param {string} html - Base email HTML
   * @param {Array} suggestions - Results from match()
   * @param {Array} cdnUrls - Uploaded CDN URLs (optional)
   * @returns {string} HTML with images inserted
   */
  buildHTML(html, suggestions, cdnUrls = []) {
    if (!suggestions.length) return html;

    let result = html;

    // Add header image if strong match
    if (suggestions[0].normalizedScore > 0.6) {
      const url = cdnUrls[0] || suggestions[0].file;
      const header = `
<div style="text-align:center; margin-bottom:20px;">
  <img src="${url}" alt="${suggestions[0].category}"
       style="max-width:600px; height:auto; display:block; margin:0 auto;">
</div>`;
      result = header + result;
    }

    // Add inline images
    for (let i = 1; i < Math.min(suggestions.length, 3); i++) {
      const url = cdnUrls[i] || suggestions[i].file;
      const inline = `
<div style="text-align:center; margin:15px 0;">
  <img src="${url}" alt="${suggestions[i].category}"
       style="max-width:400px; height:auto; display:block; margin:0 auto;">
</div>`;

      // Insert after first </p> or append
      const firstP = result.indexOf('</p>');
      if (firstP > -1) {
        result = result.slice(0, firstP + 4) + inline + result.slice(firstP + 4);
      } else {
        result += inline;
      }
    }

    return result;
  }
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const matcher = new EmailClipartMatcher('./lumise/assets/clipart-seeds/png');

  const test = await matcher.match({
    subject: 'Graduation Sale — Class of 2026!',
    content: '<p>Custom graduation caps, gowns, and personalized senior gifts...</p>',
    maxResults: 3
  });

  console.log('=== EMAIL CLIPART MATCHER TEST ===\n');
  console.log('Matched:', test.length, 'cliparts\n');
  test.forEach(s => {
    console.log(`${s.category} (score: ${s.normalizedScore.toFixed(2)})`);
    console.log(`  Keywords: ${s.keywords.join(', ')}`);
    console.log(`  File: ${s.fileName}\n`);
  });
}
