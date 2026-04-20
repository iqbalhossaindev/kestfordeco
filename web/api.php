<?php
/**
 * KestFord Video Downloader — Backend Proxy
 * Place this file at: /download/api.php (same folder as downloader.html)
 * It proxies requests to cobalt instances server-side — no CORS issues.
 */

// Allow requests only from your own domain
header('Access-Control-Allow-Origin: https://www.kestford.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST')    { http_response_code(405); echo json_encode(['status'=>'error','error'=>['code'=>'method_not_allowed']]); exit; }

// Parse incoming body
$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!$body || empty($body['url'])) {
    echo json_encode(['status'=>'error','error'=>['code'=>'error.api.link.empty']]);
    exit;
}

// Basic URL sanity check
$url = filter_var(trim($body['url']), FILTER_VALIDATE_URL);
if (!$url) {
    echo json_encode(['status'=>'error','error'=>['code'=>'error.api.link.invalid']]);
    exit;
}

// ── Cobalt community instances (no auth required) ──
// These are called server-side, so CORS is never an issue.
$instances = [
    'https://cobalt.ggtyler.dev',
    'https://cobalt.lunar.icu',
    'https://cobalt-api.asm3.org',
    'https://dl.cobalt.best',
    'https://cob.frytki.net',
    'https://cobalt.privacyredirect.com',
    'https://cobalt.seionmoya.net',
    'https://cobalt.api.beeble.dev',
];

// Errors that mean "stop trying, this video can't be downloaded"
$fatalCodes = [
    'error.api.content.unavailable',
    'error.api.content.private',
    'error.api.content.age',
    'error.api.youtube.login',
    'error.api.content.too_long',
    'error.api.link.invalid',
    'error.api.link.empty',
];

$lastResponse = null;

foreach ($instances as $instance) {
    $endpoint = rtrim($instance, '/') . '/';

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($body),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Accept: application/json',
            'User-Agent: KestFordDownloader/1.0',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    // Skip on curl failure or non-200
    if ($curlErr || !$response || $httpCode !== 200) {
        continue;
    }

    $data = json_decode($response, true);
    if (!$data || !isset($data['status'])) {
        continue;
    }

    // Success — return immediately
    if (in_array($data['status'], ['redirect', 'tunnel', 'picker', 'local-processing'], true)) {
        echo $response;
        exit;
    }

    // Fatal error — no point trying other instances
    if ($data['status'] === 'error') {
        $code = $data['error']['code'] ?? '';
        if (in_array($code, $fatalCodes, true)) {
            echo $response;
            exit;
        }
        // Non-fatal (rate limit, auth on this instance, etc.) — try next
        $lastResponse = $response;
        continue;
    }

    // Unknown status — try next
    $lastResponse = $response;
}

// All instances failed
if ($lastResponse) {
    echo $lastResponse;
} else {
    echo json_encode([
        'status' => 'error',
        'error'  => ['code' => 'error.api.unreachable'],
    ]);
}
