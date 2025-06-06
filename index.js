import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function openBetCity() {
    const options = new chrome.Options();
    options.addArguments('--start-maximized');
    
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    try {
        await driver.get('https://betcity.by/ru');
        await driver.wait(until.elementLocated(By.css('body')), 10000);
        
        const footballLink = await driver.wait(
            until.elementLocated(By.css('a[href="/ru/line/soccer"]')),
            10000
        );
        
        await driver.wait(until.elementIsVisible(footballLink), 10000);
        await footballLink.click();
        
        const periodSelect = await driver.wait(
            until.elementLocated(By.css('app-select[name="selectedPeriod"]')),
            10000
        );
        
        await driver.executeScript('arguments[0].scrollIntoView(true);', periodSelect);
        await driver.sleep(500);
        
        await periodSelect.click();
        await driver.sleep(500);
        
        await driver.executeScript(`
            function findAndClickOption() {
                const selectors = [
                    'app-select[name="selectedPeriod"] select option[value="48"]',
                    'select option[value="48"]',
                    '.select-dropdown option[value="48"]',
                    'app-select option[value="48"]'
                ];
                
                for (const selector of selectors) {
                    const option = document.querySelector(selector);
                    if (option) {
                        const select = option.closest('select');
                        if (select) {
                            select.value = '48';
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                            select.dispatchEvent(new Event('input', { bubbles: true }));
                            return true;
                        }
                    }
                }
                return false;
            }
            return findAndClickOption();
        `);
        
        await driver.sleep(500);
        
        await driver.executeScript(`
            function findSortingSelect() {
                const appSelects = document.querySelectorAll('app-select');
                for (const appSelect of appSelects) {
                    const select = appSelect.querySelector('select');
                    if (select) {
                        const options = Array.from(select.options).map(opt => opt.textContent);
                        // Check if this select has the sorting options
                        if (options.some(text => text.includes('По алфавиту'))) {
                            // Click to open
                            appSelect.click();
                            
                            // Set the value immediately
                            select.value = '2';  // По алфавиту
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                            select.dispatchEvent(new Event('input', { bubbles: true }));
                            return true;
                        }
                    }
                }
                return false;
            }
            return findSortingSelect();
        `);
        
        await driver.sleep(500);
        const allEventsCheckbox = await driver.wait(
            until.elementLocated(By.xpath('//div[contains(@class, "champs__champ_all")]')),
            10000
        );
        
        await driver.executeScript('arguments[0].scrollIntoView(true);', allEventsCheckbox);
        await driver.sleep(500);
        
        await allEventsCheckbox.click();
        
        await driver.sleep(500);
        
        const showButton = await driver.wait(
            until.elementLocated(By.css('button.line__controls-button')),
            10000
        );

        await driver.wait(until.elementIsVisible(showButton), 5000);
        await driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", showButton);
        await driver.executeScript("arguments[0].click();", showButton);
        await driver.sleep(5000);

        const statLinks = await driver.findElements(By.css('a[href^="/ru/mstat/"]'));
        const hrefs = [];

        for (const link of statLinks) {
            const href = await link.getAttribute('href');
            if (href) {
                hrefs.push(href);
            }
        }

        await driver.sleep(1000);
        return hrefs;
        
        
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await driver.quit();
    }
}

function saveResultsToJsonAndCsv(results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const resultsDir = path.join(__dirname, 'results');

    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const jsonFile = path.join(resultsDir, `matches_${timestamp}.json`);
    const csvFile = path.join(resultsDir, `matches_${timestamp}.csv`);

    fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2), 'utf-8');

    const csvHeader = 'Команды,Ссылка на матч,Количество матчей 0:0\n';
    const csvBody = results.map(match =>
        `"${match.teams}","${match.url}",${match.zeroZeroCount}`
    ).join('\n');
    fs.writeFileSync(csvFile, csvHeader + csvBody, 'utf-8');
}

async function checkStatsPages(statUrls) {
    const options = new chrome.Options();
    options.addArguments('--start-maximized');

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    const matchesWithZeros = [];

    try {
        for (const relativeUrl of statUrls) {
            await driver.get(relativeUrl);
            await driver.sleep(2000);

            const pageSource = await driver.getPageSource();

            const zeroDrawRegex = /(\d+:\d+)\s*\(/g;
            const scoreTables = pageSource.split('Последние игры');

            let foundValid = false;

            for (const teamSection of scoreTables.slice(1, 3)) {
                const matches = [...teamSection.matchAll(zeroDrawRegex)];
                let zeroZeroCount = 0;

                for (let i = 0; i < Math.min(matches.length, 5); i++) {
                    const score = matches[i][1];
                    if (score.trim() === '0:0') {
                        zeroZeroCount++;
                    } else {
                        break;
                    }
                }

                if (zeroZeroCount >= 3) {
                    foundValid = true;
                    break;
                }
            }

            if (foundValid) {
                matchesWithZeros.push(relativeUrl);
            }
        }
    } catch (error) {
        console.error('Error in checkStatsPages:', error);
    } finally {
        await driver.quit();
    }

    return matchesWithZeros;
}

async function sendEmailNotification(results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = path.join(__dirname, 'results');
    const jsonFile = path.join(resultsDir, `matches_${timestamp}.json`);
    const csvFile = path.join(resultsDir, `matches_${timestamp}.csv`);

    // Save results to files
    saveResultsToJsonAndCsv(results);

    // Prepare email data
    const emailData = {
        subject: `BetCity Parser Results - ${new Date().toLocaleDateString()}`,
        text: `Found ${results.length} matches with three or more 0:0 results.`,
        attachments: [
            {
                filename: `matches_${timestamp}.json`,
                path: jsonFile
            },
            {
                filename: `matches_${timestamp}.csv`,
                path: csvFile
            }
        ]
    };

    // Send email
    const sendEmail = httpsCallable(functions, 'sendEmailNotification');
    try {
        await sendEmail(emailData);
        console.log('Email notification sent successfully');
    } catch (error) {
        console.error('Error sending email notification:', error);
    }
}

openBetCity()
    .then(response => {
        checkStatsPages(response).then(results => {
            console.log('Матчи с тремя и более 0:0:', results);
            saveResultsToJsonAndCsv(results);
            return sendEmailNotification(results);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        sendEmailNotification([{
            error: true,
            message: error.message,
            timestamp: new Date().toISOString()
        }]);
    });
