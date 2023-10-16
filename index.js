const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const stateJson = require('./json');

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
        let response = await fetch(url, { headers: options/* , agent: proxyAgent */ });
        let body = await response.text();

        let statusCode = response.status;
        console.log(`Status Code: ${statusCode}`);

        if (statusCode < 400) {
            return cheerio.load(body);
        } else {
            return undefined;
        }
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

// Configuring IP and Port through HttpsProxyAgent
const configureProxy = async (ip) => {
    const proxyUrl = `http://${ip}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    return proxyAgent;
}

// Was returning an array of objects [{},{}]
// This func flattens those to just 1 object
const flatten = (objArr) => {
    let flattened = {};
    objArr.forEach(x => {
        Object.keys(x).forEach(y => {
            flattened[y] = x[y];
        });
    });
    return flattened;
}

// JSON objects are very large and sometimes get blocked midway.
// Checks how many districts have been scraped and continues from that index.
const getStateIndex = (state) => {
    if (stateJson[state] !== undefined) {
        let object = stateJson[state]['Districts'];
        let index = 0;
        Object.keys(object).forEach(element => {
            let data = object[element]['Data'];
            let array = Object.keys(data);
            if (array.length > 0) {
                index++;
            }
        })
        console.log(`${index} ${state} districts already scraped!`);
        return { index: index, stateObject: stateJson[state] };
    } else {
        console.log('State not defined!');
        return { index: 0, stateObject: undefined };
    }
}

// Main scraper. Returns a JSON object
const scraper = async (url, state) => {
    let { index, stateObject } = getStateIndex(state);
    if (stateObject === undefined) {
        let $ = await loadPage(url);

        let pages = await getPages($);
        pages.forEach((x, i) => {
            if (x > 1) {
                pages[i] = `${url}?page=${x}`
            } else {
                pages[i] = url;
            }
        })
        if (pages.length < 1) pages[0] = url;
        console.log(pages);

        let result = [];
        for (let i = 0; i < pages.length; i++) {
            await randomTimeout(10, 10);
            if (i > 0) {
                $ = await loadPage(pages[i]);
                let links = await getLinks($);
                result.push(links);
            } else {
                let links = await getLinks($);
                result.push(links);
            }
        }

        result = flatten(result);
        console.log(result);
        let linkObject = await mainLoadingLoop(result);

        console.log(linkObject);
        return { "Districts": linkObject }
    } else {
        let result = {};
        Object.keys(stateObject['Districts']).forEach(x => {
            result[x] = stateObject['Districts'][x]['Niche'];
        })

        let linkObject = await mainLoadingLoop(result, index, stateObject['Districts']);

        return { "Districts": linkObject };
    }
}

// Main loop that's loading tons of webpages
// Have to employ several different solutions to not get blocked by the website (403 Forbidden)
const mainLoadingLoop = async (result, index, stateObject) => {
    let arr = Object.keys(result), broken = false;
    index = index || 0;
    linkObject = stateObject || {};

    for (let i = index; i < arr.length; i++) {
        let link = result[arr[i]];
        console.log(`${i + 1}: ${link}`);

        let $;
        if (!broken) {
            await randomTimeout(10, 10);
            $ = await loadPage(link);
        } else {
            $ = undefined;
        }

        let data;
        if ($ !== undefined) {
            data = await getContact($);
        } else {
            broken = true;
            data = [[], {}];
            console.log(data);
        }

        linkObject[arr[i]] = { 'Niche': link, 'Data': data[1] };
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
    if (obj['Phone'] === undefined) obj['Phone'] = "N/A";

    $('.profile__address--compact').map((i, el) => {
        let text = $(el).text();
        matches.push(text);
        obj['Address'] = text;
    })
    if (obj['Address'] === undefined) obj['Address'] = "N/A";

    $('section#students div.scalar__value span').map((i, el) => {
        let arr = ['Students', 'Free or Reduced Lunch'];
        matches.push(el.children[0].data);
        obj[arr[i]] = el.children[0].data;
    })
    if (obj['Students'] === undefined) obj['Students'] = "N/A";
    if (obj['Free or Reduced Lunch'] === undefined) obj['Free or Reduced Lunch'] = "N/A";

    $('section#finances div.scalar__value span').map((i, el) => {
        let dollars;
        if (i === 0) {
            dollars = $(el).text();
            matches.push(dollars);
            obj['Expenses/Student'] = dollars;
        }
    })
    if (obj['Expenses/Student'] === undefined) obj['Expenses/Student'] = "N/A";

    $('section#finances ul.breakdown-facts li .fact__table__row__value').map((i, el) => {
        let value;
        if (i === 1) {
            value = $(el).text();
            matches.push(value);
            obj['Support Services'] = value;
        }
    })
    if (obj['Support Services'] === undefined) obj['Support Services'] = "N/A";

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

app.get('/links', async (req, res) => {
    let district = 'texas';
    let url = `https://www.niche.com/k12/search/best-school-districts/s/${district}/`;
    district = district.split('-').join('');
    try {
        let result = await scraper(url, district);
        let stringify = JSON.stringify(result);
        fs.writeFile(`json/${district.split('-').join('')}.json`, stringify, (err) => {
            if (err) {
                console.log(err);
            }
        });
        res.json(result);
    } catch (err) {
        console.log(err);
    }
})

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server is running on port: ${port} xD`));