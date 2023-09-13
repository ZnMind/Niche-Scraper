const express = require('express');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const API_SERVICE_URL = 'https://www.niche.com/k12/d/west-ada-school-district-id/';
const headers = {
    'Cache-Control': 'max-age=0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
}

app.use('/', createProxyMiddleware({ 
    target: API_SERVICE_URL, 
    changeOrigin: true,
    headers: headers
}));

app.listen(PORT, () => console.log(`Starting proxy at ${HOST}:${PORT}`));