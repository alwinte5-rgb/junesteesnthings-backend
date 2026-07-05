# Email Clipart System — Smart Image Matching for Email Campaigns

Automatically match relevant cliparts from your 326-image collection to any email content. Works with Brevo, Mailchimp, SendGrid, Gmail, or any email platform.

## 📦 What's Included

- **326 PNG Cliparts** organized in 21 categories
- **Smart matching algorithm** that analyzes email content
- **JavaScript matcher** for client-side apps
- **PHP matcher** for server-side integration
- **Brevo integration** examples
- **Template system** for reusable email designs

## 🎨 Categories (326 total)

| Category | Count | Best For |
|---|---|---|
| alphabets-monograms | 45 | Personalized emails, name-based campaigns |
| girl-power | 37 | Women's events, empowerment campaigns |
| shapes | 34 | Backgrounds, decorative elements |
| sarcastic-funny | 32 | Casual newsletters, humor content |
| peekaboo-kids | 27 | Children's products, family events |
| wine-drinks | 24 | Happy hour, party invitations |
| backgrounds | 22 | Email headers, section dividers |
| sports | 17 | Athletic events, team sales |
| animals | 15 | Pet products, wildlife themes |
| people | 12 | General marketing, testimonials |
| family | 11 | Reunion announcements, family sales |
| halloween | 10 | October campaigns, costume sales |
| birthday | 8 | Birthday promotions, party supplies |
| love-romance | 8 | Valentine's, anniversary sales |
| vehicles | 6 | Automotive, travel themes |
| graduation | 6 | May/June campaigns, senior products |
| faith-inspiration | 6 | Religious holidays, inspirational content |
| hustle-motivation | 3 | Business/entrepreneur content |
| black-culture | 1 | Heritage events, cultural celebrations |
| black-history | 1 | February campaigns, educational content |
| christmas | 1 | Holiday season emails |

## 🚀 Quick Start

### Option 1: JavaScript (Browser/Node.js)

```javascript
const matcher = new EmailClipartMatcher('/path/to/cliparts');

const template = matcher.buildTemplate({
  subject: 'Graduation Sale - 50% Off!',
  content: '<p>Get ready for your senior year celebration...</p>',
  autoInsert: true
});

console.log(template.suggestions);
// [
//   { category: 'graduation', normalizedScore: 0.85, matchedKeywords: ['graduation', 'senior'] },
//   { category: 'shapes', normalizedScore: 0.42, matchedKeywords: ['celebration'] }
// ]
```

### Option 2: PHP (Server-side)

```php
<?php
require_once 'email-template-builder.php';

$builder = new EmailTemplateBuilder(__DIR__ . '/assets/clipart-seeds/png');

$template = $builder->create([
    'subject' => 'Halloween Party - Spooky Savings!',
    'content' => '<p>Get your costume ready for the big night!</p>',
    'max_images' => 2,
    'min_score' => 0.3
]);

echo "Matched: " . count($template['suggestions']) . " cliparts\n";
foreach ($template['suggestions'] as $img) {
    echo "  - {$img['category']} (score: {$img['score']})\n";
}
```

## 📧 Brevo Integration

### 1. Using with Brevo Campaigns

```php
<?php
// Create template with smart clipart matching
$builder = new EmailTemplateBuilder('/path/to/cliparts', 'YOUR_BREVO_API_KEY');

$template = $builder->create([
    'subject' => 'Summer Graduation Sale',
    'content' => $your_email_html,
    'upload_images' => false  // We'll use URLs
]);

// Upload cliparts to your CDN (Cloudinary, S3, etc)
$cdn_urls = [];
foreach ($template['suggestions'] as $img) {
    $cdn_urls[] = upload_to_cdn($img['path']);
}

// Create Brevo campaign
$campaign_data = [
    'name' => 'Graduation Sale 2026',
    'subject' => $template['subject'],
    'htmlContent' => $builder->build_html($template['content'], $template['suggestions'], $cdn_urls),
    'sender' => ['name' => "June's Tees", 'email' => 'support@jtees.net'],
    'listIds' => [YOUR_LIST_ID]
];

// Send via Brevo API
$ch = curl_init('https://api.brevo.com/v3/emailCampaigns');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($campaign_data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'api-key: ' . 'YOUR_BREVO_API_KEY',
    'Content-Type: application/json'
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = curl_exec($ch);
curl_close($ch);
?>
```

### 2. Save Reusable Templates

```php
// Create and save template
$template = $builder->create([
    'subject' => 'Monthly Newsletter Template',
    'content' => $newsletter_html
]);

$builder->save_template('monthly-newsletter', $template);

// Load later
$saved = $builder->load_template('monthly-newsletter');
```

## 🎯 How Matching Works

The system analyzes email content using:

1. **Keyword Matching** — Scans subject + content for category-specific keywords
2. **Seasonal Boost** — Increases relevance for timely categories (Christmas in Dec, Halloween in Oct, Graduation in May/June)
3. **Score Normalization** — Converts raw scores to 0-1 scale
4. **Smart Filtering** — Only suggests images with >30% relevance by default

### Example Match

**Email:**
```
Subject: "Senior Class of 2026 - Custom Graduation Caps"
Content: "Celebrate your graduate with personalized gifts..."
```

**Matches:**
- `graduation` (score: 0.92) — Keywords: graduation, senior, graduate
- `girl-power` (score: 0.38) — Keywords: celebrate, gifts
- `shapes` (score: 0.24) — Generic decorative elements

## 🔧 Customization

### Adjust Match Sensitivity

```javascript
// Only show very strong matches
const suggestions = matcher.matchEmail({
  subject,
  content,
  maxImages: 1,
  minScore: 0.7  // Default is 0.3
});
```

### Force Specific Category

```javascript
// Always use graduation category for header
const template = matcher.buildTemplate({
  subject,
  content,
  headerCategory: 'graduation',  // Override auto-detection
  autoInsert: true
});
```

### Add Custom Keywords

```php
// In email-template-builder.php, extend category_keywords array
$this->category_keywords['graduation'][] = 'commencement';
$this->category_keywords['graduation'][] = 'class of';
$this->category_keywords['graduation'][] = 'alumni';
```

## 📤 Hosting Images for Email

Emails require publicly accessible URLs. Options:

### Option 1: Cloudinary (Recommended)
```bash
# Upload entire collection
for dir in assets/clipart-seeds/png/*/; do
  for file in "$dir"*.png; do
    curl -X POST "https://api.cloudinary.com/v1_1/YOUR_CLOUD/image/upload" \
      -F "file=@$file" \
      -F "folder=email-clipart/$(basename $dir)" \
      -F "upload_preset=YOUR_PRESET"
  done
done
```

### Option 2: Your Website
```bash
# Copy to public directory
cp -r assets/clipart-seeds/png/* /var/www/html/email-clipart/
# Reference as: https://jtees.net/email-clipart/graduation/grad-cap.png
```

### Option 3: Amazon S3
```bash
aws s3 sync assets/clipart-seeds/png/ s3://your-bucket/email-clipart/ --acl public-read
```

## 📊 Testing

```bash
# Test PHP matcher
php email-template-builder.php

# Test with your own content
php -r "
require 'email-template-builder.php';
\$builder = new EmailTemplateBuilder('./assets/clipart-seeds/png');
\$result = \$builder->create([
    'subject' => 'Test Subject',
    'content' => 'Test content here...'
]);
print_r(\$result['suggestions']);
"
```

## 🔐 Multi-Account Setup

To use with multiple email accounts:

1. **Copy matcher files** to your project:
   ```bash
   cp email-clipart-matcher.js your-project/
   cp email-template-builder.php your-project/
   ```

2. **Point to clipart directory**:
   ```php
   $builder = new EmailTemplateBuilder('/shared/path/to/cliparts');
   ```

3. **Use different API keys per account**:
   ```php
   $brevo_builder = new EmailTemplateBuilder($path, $brevo_key);
   $mailchimp_builder = new EmailTemplateBuilder($path, $mailchimp_key);
   ```

## 📝 File Locations

```
.
├── assets/clipart-seeds/png/          # Source PNGs (326 files)
│   ├── alphabets-monograms/
│   ├── graduation/
│   ├── halloween/
│   └── ... (21 categories)
├── data/cliparts/png/                 # Runtime location (seeded on deploy)
├── email-clipart-matcher.js           # JavaScript matcher
├── email-template-builder.php         # PHP matcher + Brevo integration
└── EMAIL-CLIPART-README.md            # This file
```

## 🎨 Category Keyword Reference

Full keyword list per category (for customization):

```javascript
{
  'graduation': ['graduation', 'grad', 'graduate', 'senior', 'class of', 'diploma'],
  'halloween': ['halloween', 'spooky', 'trick or treat', 'costume', 'pumpkin', 'ghost'],
  'christmas': ['christmas', 'xmas', 'holiday', 'santa', 'winter', 'snow'],
  'birthday': ['birthday', 'bday', 'party', 'celebrate', 'age', 'turning'],
  'family': ['family', 'mom', 'dad', 'cousin', 'reunion', 'gender reveal', 'aunt'],
  'girl-power': ['queen', 'crown', 'diva', 'fabulous', 'girl', 'woman', 'ladies'],
  // ... see email-clipart-matcher.js for complete list
}
```

## 💡 Best Practices

1. **Seasonal Timing** — System auto-boosts seasonal categories (Halloween in Oct, Christmas in Nov/Dec, Graduation in May/June)
2. **Test Before Sending** — Always preview matched images before launching campaign
3. **Mobile Optimization** — Keep header images under 600px wide for mobile
4. **Alt Text** — Auto-generated from category name, customize for accessibility
5. **CDN Hosting** — Host on CDN for faster email load times

## 🐛 Troubleshooting

**No matches found:**
- Lower `minScore` to 0.2 or 0.1
- Check category keywords — add custom keywords for your industry
- Use `headerCategory` to force a specific category

**Images not loading in email:**
- Verify URLs are publicly accessible (not localhost)
- Check image file sizes (<1MB recommended for email)
- Test with [mail-tester.com](https://www.mail-tester.com)

**Wrong category matched:**
- Review `category_keywords` — remove generic keywords
- Increase `minScore` to require stronger matches
- Add more specific keywords to preferred categories

---

**Next Steps:**
1. Upload cliparts to CDN/public hosting
2. Test matcher with sample email content
3. Integrate with your email platform
4. Create reusable templates for common campaigns
