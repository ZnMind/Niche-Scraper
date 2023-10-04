const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

const stateData = require('./json');
const googleSheet = '1zh0qzOsxhkRfhCiqwBohbwmu2tkdhficfpMMWUElLWs';

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

const postData = async (user, sheet, val) => {
    console.log(`${sheet}:`);
    await updateValParams(user, googleSheet, `${sheet}!A1`, 'USER_ENTERED', val)
}

const updateValParams = async (auth, spreadsheetId, range, valueInputOption, values) => {
    const sheets = google.sheets({ version: 'v4', auth });
    const resource = {
        values,
    };

    try {
        const result = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption,
            resource,
        })

        console.log('%d cells updated.', result.data.updatedCells);
        return result;
    } catch (err) {
        throw err;
    }
}

const getSheets = async (auth) => {
    const sheets = google.sheets({ version: 'v4', auth });
    try {
        const res = await sheets.spreadsheets.get({
            spreadsheetId: googleSheet
        })
        let array = [];
        res.data.sheets.forEach(x => array.push(x['properties']['title']));
        console.log(array);
        return array;
    } catch (err) {
        console.error(err);
    }
}

const createSheet = async (sheets, title) => {
    const resource = {
        properties: {
            title: title
        }
    };
    try {
        const spreadsheet = await sheets.spreadsheets.create({
            resource,
            fields: 'spreadsheetId',
        });
        console.log(`Spreadsheet ID: ${spreadsheet.data.spreadsheetId}`);
        return spreadsheet.data.spreadsheetId;
    } catch (err) {
        console.log(err);
    }
}

const formatData = (state) => {
    if (state.split(' ').length > 1) {
        state = state.toLowerCase().split(' ').join('');
    } else {
        state = state.toLowerCase();
    }
    let headings = [
        `=CONCAT("Districts:   ",counta(A3:A))`,
        "Website", "Phone", "Address", "Students", "FoRL", "Expenses/Student", "Support Spending",
        `=HYPERLINK("https://github.com/ZnMind/Niche-Scraper/blob/main/json/${state}.json", "JSON")`
    ];
    let result = [headings, []]
    let obj = stateData[state]['Districts'];
    let data = Object.keys(obj);

    for (let i = 0; i < data.length; i++) {
        let district = data[i];
        let link = stateData[state]['Districts'][district]['Niche'];
        let formula = `=HYPERLINK("${link}", "${district}")`;
        let info = Object.values(stateData[state]['Districts'][district]['Data']);
        if (info[1] !== undefined) info[1] = info[1].replace(/[^+\d]+/g, '');
        result.push([formula, ...info]);
    }

    // Sorting by students
    result.sort((a, b) => {
        if (a[4] !== undefined && b[4] !== undefined) {
            return parseInt(b[4].split(',').join('')) - parseInt(a[4].split(',').join(''))
        };
    });

    return result;
}

const postAllData = async (user, stateArray) => {
    for (let i = 0; i < stateArray.length; i++) {
        let val = formatData(stateArray[i]);
        await postData(user, stateArray[i], val);
    }
    console.log(
        `${stateArray.length > 1
            ? `Done with ${stateArray.length} states!`
            : `Done with ${stateArray.length} state!`}`
    );
}

(async () => {
    const user = await authorize();
    const stateArray = await getSheets(user);
    postAllData(user, stateArray);
})();