<?php
/**
 * Email Template Builder with Smart Clipart Matching
 * Works with Brevo API and any email platform
 *
 * Usage:
 *   $builder = new EmailTemplateBuilder('/path/to/cliparts');
 *   $template = $builder->create([
 *       'subject' => 'Summer Sale!',
 *       'content' => '<p>Check out our graduation deals...</p>',
 *       'brevo_api_key' => 'your-key',
 *       'upload_images' => true
 *   ]);
 */

class EmailTemplateBuilder {
    private $clipart_base;
    private $category_keywords;
    private $brevo_api_key;

    public function __construct($clipart_base_path, $brevo_api_key = null) {
        $this->clipart_base = rtrim($clipart_base_path, '/');
        $this->brevo_api_key = $brevo_api_key;

        // Category keywords for matching
        $this->category_keywords = [
            'alphabets-monograms' => ['letter', 'initial', 'monogram', 'alphabet', 'name', 'personalized'],
            'adult-humor' => ['funny', 'sarcastic', 'humor', 'joke', 'laugh', 'wtf', 'sassy'],
            'animals' => ['pet', 'dog', 'cat', 'bird', 'animal', 'wildlife', 'zoo', 'paw'],
            'backgrounds' => ['texture', 'pattern', 'background', 'glitter', 'sparkle', 'design'],
            'birthday' => ['birthday', 'bday', 'party', 'celebrate', 'age', 'turning', 'sonic'],
            'black-culture' => ['black', 'african american', 'culture', 'heritage', 'pride'],
            'black-history' => ['mlk', 'history', 'civil rights', 'heritage month', 'julian'],
            'christmas' => ['christmas', 'xmas', 'holiday', 'santa', 'winter', 'snow'],
            'faith-inspiration' => ['faith', 'pray', 'god', 'church', 'blessed', 'cross', 'spiritual'],
            'family' => ['family', 'mom', 'dad', 'cousin', 'reunion', 'gender reveal', 'aunt'],
            'girl-power' => ['queen', 'crown', 'diva', 'fabulous', 'girl', 'woman', 'ladies'],
            'graduation' => ['graduation', 'grad', 'graduate', 'senior', 'class of', 'diploma'],
            'halloween' => ['halloween', 'spooky', 'trick or treat', 'costume', 'pumpkin', 'ghost'],
            'hustle-motivation' => ['hustle', 'grind', 'motivation', 'money', 'boss', 'entrepreneur'],
            'love-romance' => ['love', 'valentine', 'heart', 'romance', 'wedding', 'anniversary'],
            'peekaboo-kids' => ['kid', 'children', 'baby', 'toddler', 'child', 'bunny', 'easter'],
            'people' => ['person', 'people', 'human', 'man', 'woman', 'hand'],
            'sarcastic-funny' => ['sarcasm', 'sarcastic', 'funny', 'humor', 'overthink', 'mood'],
            'shapes' => ['star', 'shape', 'frame', 'border', 'icon', 'symbol', 'crown'],
            'sports' => ['sports', 'soccer', 'basketball', 'football', 'racing', 'volleyball'],
            'vehicles' => ['car', 'truck', 'vehicle', 'ship', 'cruise', 'road'],
            'wine-drinks' => ['wine', 'drink', 'alcohol', 'beer', 'cocktail', 'party', 'shots']
        ];
    }

    /**
     * Create email template with smart clipart matching
     */
    public function create($options) {
        $subject = $options['subject'] ?? '';
        $content = $options['content'] ?? '';
        $max_images = $options['max_images'] ?? 2;
        $min_score = $options['min_score'] ?? 0.3;
        $upload_to_brevo = $options['upload_images'] ?? false;

        // Match cliparts
        $matches = $this->match_cliparts($subject, $content, $max_images, $min_score);

        if (empty($matches)) {
            return [
                'subject' => $subject,
                'html' => $content,
                'suggestions' => [],
                'uploaded_urls' => []
            ];
        }

        // Get actual file paths
        $selected_images = [];
        foreach ($matches as $match) {
            $files = $this->get_category_files($match['category']);
            if (!empty($files)) {
                $random_file = $files[array_rand($files)];
                $selected_images[] = [
                    'category' => $match['category'],
                    'path' => $random_file,
                    'score' => $match['score'],
                    'keywords' => $match['keywords']
                ];
            }
        }

        // Upload to Brevo if requested
        $uploaded_urls = [];
        if ($upload_to_brevo && !empty($this->brevo_api_key)) {
            foreach ($selected_images as $img) {
                $url = $this->upload_to_brevo($img['path']);
                if ($url) {
                    $uploaded_urls[] = $url;
                }
            }
        }

        // Build HTML
        $html = $this->build_html($content, $selected_images, $uploaded_urls);

        return [
            'subject' => $subject,
            'html' => $html,
            'suggestions' => $selected_images,
            'uploaded_urls' => $uploaded_urls
        ];
    }

    /**
     * Match clipart categories to email content
     */
    private function match_cliparts($subject, $content, $max_images, $min_score) {
        $text = strtolower($subject . ' ' . strip_tags($content));
        $scores = [];

        foreach ($this->category_keywords as $category => $keywords) {
            $score = 0;
            $matched_keywords = [];

            foreach ($keywords as $keyword) {
                $pattern = '/\b' . preg_quote($keyword, '/') . '\w*/i';
                if (preg_match_all($pattern, $text, $matches)) {
                    $weight = strlen($keyword) > 6 ? 1.5 : 1.0;
                    $score += count($matches[0]) * $weight;
                    $matched_keywords[] = $keyword;
                }
            }

            if ($score > 0) {
                $scores[$category] = [
                    'category' => $category,
                    'score' => $score,
                    'normalized_score' => min(1.0, $score / 10),
                    'keywords' => $matched_keywords
                ];
            }
        }

        // Seasonal boost
        $month = (int)date('n');
        if (($month === 12 || $month === 11) && isset($scores['christmas'])) {
            $scores['christmas']['score'] *= 2;
            $scores['christmas']['normalized_score'] = min(1.0, $scores['christmas']['score'] / 10);
        }
        if ($month === 10 && isset($scores['halloween'])) {
            $scores['halloween']['score'] *= 2;
            $scores['halloween']['normalized_score'] = min(1.0, $scores['halloween']['score'] / 10);
        }
        if (($month === 5 || $month === 6) && isset($scores['graduation'])) {
            $scores['graduation']['score'] *= 2;
            $scores['graduation']['normalized_score'] = min(1.0, $scores['graduation']['score'] / 10);
        }

        // Filter and sort
        $filtered = array_filter($scores, function($s) use ($min_score) {
            return $s['normalized_score'] >= $min_score;
        });

        usort($filtered, function($a, $b) {
            return $b['score'] <=> $a['score'];
        });

        return array_slice($filtered, 0, $max_images);
    }

    /**
     * Get all PNG files in a category
     */
    private function get_category_files($category) {
        $dir = $this->clipart_base . '/' . $category;
        if (!is_dir($dir)) {
            return [];
        }

        $files = glob($dir . '/*.png');
        return $files ?: [];
    }

    /**
     * Upload image to Brevo's media library (placeholder)
     */
    private function upload_to_brevo($file_path) {
        if (!$this->brevo_api_key || !file_exists($file_path)) {
            return null;
        }

        // Brevo doesn't have a direct image upload API
        // You need to host images externally and reference them
        // For now, return a placeholder URL
        // In production, upload to Cloudinary or your own CDN

        return 'https://jtees.net/email-clipart/' . basename($file_path);
    }

    /**
     * Build final HTML with images
     */
    private function build_html($content, $selected_images, $uploaded_urls) {
        $html = $content;

        // Add header image if we have a strong match
        if (!empty($selected_images) && $selected_images[0]['score'] > 6) {
            $header_url = $uploaded_urls[0] ?? $selected_images[0]['path'];
            $header = '<div style="text-align:center; margin-bottom:20px;">' .
                      '<img src="' . htmlspecialchars($header_url) . '" ' .
                      'alt="' . htmlspecialchars($selected_images[0]['category']) . '" ' .
                      'style="max-width:600px; height:auto; display:block; margin:0 auto;">' .
                      '</div>';
            $html = $header . $html;
        }

        // Add inline images
        if (count($selected_images) > 1) {
            for ($i = 1; $i < count($selected_images) && $i < 3; $i++) {
                $inline_url = $uploaded_urls[$i] ?? $selected_images[$i]['path'];
                $inline = '<div style="text-align:center; margin:15px 0;">' .
                         '<img src="' . htmlspecialchars($inline_url) . '" ' .
                         'alt="' . htmlspecialchars($selected_images[$i]['category']) . '" ' .
                         'style="max-width:400px; height:auto; display:block; margin:0 auto;">' .
                         '</div>';

                // Insert after first paragraph
                $first_p = strpos($html, '</p>');
                if ($first_p !== false) {
                    $html = substr($html, 0, $first_p + 4) . $inline . substr($html, $first_p + 4);
                } else {
                    $html .= $inline;
                }
            }
        }

        return $html;
    }

    /**
     * Save template to file for reuse
     */
    public function save_template($name, $template_data) {
        $templates_dir = $this->clipart_base . '/../email-templates';
        if (!is_dir($templates_dir)) {
            mkdir($templates_dir, 0755, true);
        }

        $file = $templates_dir . '/' . preg_replace('/[^a-z0-9-]/', '-', strtolower($name)) . '.json';
        file_put_contents($file, json_encode($template_data, JSON_PRETTY_PRINT));

        return $file;
    }

    /**
     * Load saved template
     */
    public function load_template($name) {
        $templates_dir = $this->clipart_base . '/../email-templates';
        $file = $templates_dir . '/' . preg_replace('/[^a-z0-9-]/', '-', strtolower($name)) . '.json';

        if (!file_exists($file)) {
            return null;
        }

        return json_decode(file_get_contents($file), true);
    }
}

// Example usage
if (php_sapi_name() === 'cli' && basename(__FILE__) === basename($_SERVER['PHP_SELF'])) {
    $builder = new EmailTemplateBuilder(__DIR__ . '/data/cliparts/png');

    $template = $builder->create([
        'subject' => 'Graduation Season Sale - Class of 2026!',
        'content' => '<p>Celebrate your senior year with custom graduation gear!</p><p>Shop now for caps, gowns, and personalized gifts.</p>',
        'max_images' => 2,
        'min_score' => 0.3
    ]);

    echo "=== EMAIL TEMPLATE BUILDER TEST ===\n\n";
    echo "Subject: {$template['subject']}\n\n";
    echo "Matched Categories:\n";
    foreach ($template['suggestions'] as $suggestion) {
        echo "  - {$suggestion['category']} (score: {$suggestion['score']}, keywords: " . implode(', ', $suggestion['keywords']) . ")\n";
        echo "    File: {$suggestion['path']}\n";
    }
    echo "\nHTML Preview:\n";
    echo substr($template['html'], 0, 500) . "...\n";
}
