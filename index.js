const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());

// Configuration
const { headers, userAgentList } = require('./headers.json');

// Helper to load urls
const loadPage = async (url, proxyAgent) => {
    proxyAgent = proxyAgent || null;
    let options = headers;
    options['User-Agent'] = userAgentList[Math.floor(Math.random() * userAgentList.length)];

    try {
        let response = await fetch(url, { headers: options });
        let body = await response.text();

        let statusCode = response.status;
        console.log(`Status Code: ${statusCode}`);

        let $ = cheerio.load(body);
        return $;
    } catch (err) {
        console.log(err);
    }
}

// Helper to add random delay. Requests are too fast and are getting blocked
const randomTimeout = () => {
    let rng = Math.floor(Math.random() * 2000 + 2000);
    return new Promise(resolve => setTimeout(resolve, rng));
}

// Scraping free US proxies to rotate IP's and prevent being blocked
const scrapeProxy = async () => {
    let $ = await loadPage('https://free-proxy-list.net/');

    let results = [];
    $('.table tr').map((i, el) => {
        if (el.children) {
            if (el.children[0]) {
                if (el.children[0].children[0]) {
                    if (el.children[2].children[0]) {
                        if (el.children[2].children[0].data === 'US' && el.children[6].children[0].data === 'yes') {
                            results.push([el.children[0].children[0].data, el.children[1].children[0].data])
                        }
                    }
                }
            }
        }
    })
    console.log(results);
    return results;
}

// Grabbing random proxy
const randomProxy = (proxyList) => {
    let max = Math.min(50, proxyList.length - 1);
    let rng = Math.floor(Math.random() * max + 1);
    console.log(rng, proxyList[rng])
    return proxyList[rng];
}

// Configuring IP and Port through HttpsProxyAgent
const configureProxy = async (host, port) => {
    const proxyUrl = `http://${host}:${port}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    return proxyAgent;
}

const proxyMiddleware = (url) => {
    const proxyAgent = createProxyMiddleware({
        target: url,
        changeOrigin: true,
        headers: headers
    })
    return proxyAgent;
}

// Main scraper. Returns a JSON object
const scraper = async (url) => {
    let $ = await loadPage(url);

    let pages = await getPages($);
    pages.forEach((x, i) => {
        if (x > 1) {
            pages[i] = `${url}?page=${x}`
        } else {
            pages[i] = url;
        }
    })
    console.log(pages);

    let result = [], linkObject = {};
    for (let i = 0; i < pages.length; i++) {
        if (i > 0) {
            $ = await loadPage(pages[i]);
            let links = await getLinks($);
            result.push(links);
        } else {
            let links = await getLinks($);
            result.push(links);
        }
    }

    for (let i = 0; i < result.length; i++) {
        let arr = Object.keys(result[i])
        for (let j = 0; j < arr.length; j++) {
            let link = result[i][arr[j]];
            console.log(link);

            await randomTimeout();

            let $ = await loadPage(link);
            //console.log(typeof $);
            let data;
            if ($ !== undefined) {
                data = await getContact($);
            } else {
                data = [ [], {} ]
            }
            linkObject[arr[j]] = { 'Niche': link, 'Data': data[1] };
        }
    }

    console.log(linkObject);
    return { "Districts": linkObject }
}

// Checks how many pages of schools there are so all links can be grabbed
const getPages = async ($) => {
    let pages = [];
    $('.nss-1bxikzx').map((i, el) => {
        let page = el.children[0].data;
        pages.push(page);
    })
    return pages;
}

// Returns district name and Niche link
const getLinks = async ($, memo) => {
    let links = [], names = [];
    memo = memo || {};

    $('.card .nss-rilmyj').map((i, el) => {
        let link = $(el).attr('href');
        links.push(link);
    })
    $('.card .nss-w5w7xf').map((i, el) => {
        let name = el.children[0].data;
        names.push(name);
    })
    names.forEach((x, i) => {
        memo[x] = links[i];
    })
    return memo;
}

// Returns district information pulled from their Niche page
const getContact = async ($) => {
    let matches = [], obj = {};

    $('.profile__website__link').map((i, el) => {
        let link = $(el).attr('href');
        matches.push(link);
        obj['Website'] = link;
    })

    $('.profile__telephone__link').map((i, el) => {
        let text = $(el).text();
        matches.push(text);
        obj['Phone'] = text;
    })

    $('.profile__address--compact').map((i, el) => {
        let text = $(el).text();
        matches.push(text);
        obj['Address'] = text;
    })

    $('section#students div.scalar__value span').map((i, el) => {
        let arr = ['Students', 'Free or Reduced Lunch'];
        matches.push(el.children[0].data);
        obj[arr[i]] = el.children[0].data;
    })

    return [matches, obj];
}

// Endpoints
app.get('/', (req, res) => {
    let ms = Date.now();
    let date = new Date(ms);
    date = date.toString();
    console.log(date);
    res.json({ 'Your server is running': 'you better go catch it!', 'Date': date })
})

app.get('/test', async (req, res) => {
    let url = 'https://ident.me/ip/';
    try {
        let prox = await scrapeProxy();
        console.log(prox);
        res.json({ prox })
    } catch (err) {
        console.log(err);
    }
})

app.get('/links', async (req, res) => {
    let district = 'idaho';
    let url = `https://www.niche.com/k12/search/best-school-districts/s/${district}/`;
    try {
        let result = await scraper(url);
        res.json(result);
    } catch (err) {
        console.log(err);
    }
})

app.get('/one', async (req, res) => {
    let url = 'https://www.niche.com/k12/d/lewiston-independent-school-district-id/';
    //let url = 'https://ident.me/ip';
    try {
        /* let host = '35.236.207.242';
        let port = '33333'; */
        /* let proxyList = await scrapeProxy();
        let [host, port] = randomProxy(proxyList);
        console.log(`Proxy Host: ${host}:${port}`)
        let proxy = await configureProxy(host, port); */

        let page = await loadPage(url);
        let result = await getContact(page);
        console.log(result[1]);
        res.json(result[1]);
    } catch (err) {
        console.log(err);
    }
})

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server is running on port: ${port} xD`));