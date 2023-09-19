const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());

// Configuration
const { headers, userAgentList, ipList } = require('./headers.json');

// Helper to load urls
const loadPage = async (url, proxyAgent) => {
    proxyAgent = proxyAgent || null;
    //console.log(`Proxy Host: ${proxyAgent.proxy.host}`);
    let options = headers;
    options['User-Agent'] = userAgentList[Math.floor(Math.random() * userAgentList.length)];

    try {
        let response = await fetch(url, { headers: options/* , agent: proxyAgent */ });
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
const randomTimeout = (base, range) => {
    let rng = Math.random() * (range * 1000) + (base * 1000);
    console.log(`Added Delay: ${rng / 1000} seconds`);
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
const configureProxy = async (ip) => {
    const proxyUrl = `http://${ip}`;
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
    let proxyAgent = await configureProxy(ipList[Math.floor(Math.random() * ipList.length)]);
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

    let result = [];
    for (let i = 0; i < pages.length; i++) {
        await randomTimeout(5, 10);
        if (i > 0) {
            proxyAgent = await configureProxy(ipList[Math.floor(Math.random() * ipList.length)]);
            $ = await loadPage(pages[i]);
            let links = await getLinks($);
            result.push(links);
        } else {
            let links = await getLinks($);
            result.push(links);
        }
    }

    let linkObject = await mainLoadingLoop(result);

    console.log(linkObject);
    return { "Districts": linkObject }
}

// Main loop that's loading 300+ webpages
// Have to employ several different solutions to not get blocked by the website (403 Forbidden)
const mainLoadingLoop = async (result) => {
    let linkObject = {}, blackList = [];
    for (let i = 0; i < result.length; i++) {
        let arr = Object.keys(result[i]);

        for (let j = 0; j < arr.length; j++) {
            let link = result[i][arr[j]];
            await randomTimeout(5, 10);
            console.log(`${j + 1 + (i * arr.length)}: ${link}`);

            /* let rng = 0;
            const generateProxy = async () => {
                rng = Math.floor(Math.random() * ipList.length);
                if (blackList.includes(rng)) {
                    console.log(`Blacklisted: ${ipList[rng]}`);
                    generateProxy();
                } else {
                    let ip = ipList[rng];
                    let proxyAgent = await configureProxy(ip);
                    let page = await loadPage(link, proxyAgent);
                    return page;
                }
            } */
            //let $ = await generateProxy();
            let $ = await loadPage(link);

            let data;
            if ($ !== undefined) {
                data = await getContact($);
            } else {
                data = [[], {}]
                await randomTimeout(900, 30);
                j--;
                /* blackList.push(rng);
                if (blackList.length >= ipList.length) break; */
            }
            linkObject[arr[j]] = { 'Niche': link, 'Data': data[1] };
        }
        //if (blackList.length >= ipList.length) break;
    }
    return linkObject;
}

// Checks how many pages of schools there are so all links can be grabbed
const getPages = async ($) => {
    let pages = [];
    $('.nss-1bxikzx').map((i, el) => {
        let page = el.children[0].data;
        pages.push(page);
    })
    let num = pages.pop();
    pages = [];
    for (let i = 1; i <= num; i++) {
        pages.push(i);
    }
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
    if (obj['Website'] === undefined) obj['Website'] = "N/A";

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

    $('section#finances div.scalar__value span').map((i, el) => {
        let dollars;
        if (i === 0) {
            dollars = $(el).text();
            matches.push(dollars);
            obj['Expenses/Student'] = dollars;
        }
    })

    $('section#finances ul.breakdown-facts li .fact__table__row__value').map((i, el) => {
        let value;
        if (i === 1) {
            value = $(el).text();
            matches.push(value);
            obj['Support Services'] = value;
        }
    })

    return [matches, obj];
}

const states = () => {
    return ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
        'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
        'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
        'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
        'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana',
        'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
        'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma',
        'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
        'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
        'West Virginia', 'Wisconsin', 'Wyoming'];
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
    let url = 'https://www.niche.com/k12/search/best-school-districts/s/iowa/';
    try {
        let $ = await loadPage(url)
        let pages = await getPages($);
        console.log(pages);
        res.json({ pages })
    } catch (err) {
        console.log(err);
    }
})

app.get('/links', async (req, res) => {
    let district = 'illinois';
    let url = `https://www.niche.com/k12/search/best-school-districts/s/${district}/`;
    try {
        let result = await scraper(url);
        res.json(result);
    } catch (err) {
        console.log(err);
    }
})

app.get('/one', async (req, res) => {
    let url = 'https://www.niche.com/k12/d/des-moines-independent-community-school-district-ia/';
    //let url = 'https://ident.me/ip';
    try {
        //let host = "35.236.207.242";
        //let port = "33333";
        /* let proxyList = await scrapeProxy();
        let [host, port] = randomProxy(proxyList); */
        //console.log(`Proxy Host: ${host}:${port}`)
        let proxyAgent = await configureProxy(ipList[2]);

        let page = await loadPage(url, proxyAgent);
        let result = await getContact(page);
        console.log(result[1]);
        res.json(result[1]);
    } catch (err) {
        console.log(err);
    }
})

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server is running on port: ${port} xD`));