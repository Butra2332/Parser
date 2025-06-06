import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function openBetCity() {
    const options = new chrome.Options();
    options.addArguments('--start-maximized');
    // options.addArguments('--headless');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    // Добавляем аргументы для изоляции профиля пользователя и отладки
    options.addArguments('--user-data-dir=/tmp/chrome-user-data-' + Math.random().toString(36).substring(7));
    options.addArguments('--remote-debugging-port=9222');
    
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    try {
        await driver.get('https://betcity.by/ru');
        await driver.wait(until.elementLocated(By.css('body')), 10000);
        
        // Добавляем случайную задержку
        await driver.sleep(Math.random() * 2000 + 1000);
        
        const footballLink = await driver.wait(
            until.elementLocated(By.css('a[href="/ru/line/soccer"]')),
            10000
        );
        
        await driver.wait(until.elementIsVisible(footballLink), 10000);
        await driver.sleep(1000);
        await footballLink.click();
        
        await driver.sleep(2000);
        
        const periodSelect = await driver.wait(
            until.elementLocated(By.css('app-select[name="selectedPeriod"]')),
            10000
        );
        
        await driver.executeScript('arguments[0].scrollIntoView(true);', periodSelect);
        await driver.sleep(1000);
        
        await periodSelect.click();
        await driver.sleep(1000);
        
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
        
        await driver.sleep(2000);
        
        await driver.executeScript(`
            function findSortingSelect() {
                const appSelects = document.querySelectorAll('app-select');
                for (const appSelect of appSelects) {
                    const select = appSelect.querySelector('select');
                    if (select) {
                        const options = Array.from(select.options).map(opt => opt.textContent);
                        if (options.some(text => text.includes('По алфавиту'))) {
                            appSelect.click();
                            select.value = '2';
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
        
        await driver.sleep(2000);
        
        const allEventsCheckbox = await driver.wait(
            until.elementLocated(By.xpath('//div[contains(@class, "champs__champ_all")]')),
            10000
        );
        
        await driver.executeScript('arguments[0].scrollIntoView(true);', allEventsCheckbox);
        await driver.sleep(1000);
        
        await allEventsCheckbox.click();
        await driver.sleep(2000);
        
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

        await driver.sleep(2000);
        return hrefs;
        
    } catch (error) {
        console.error('An error occurred:', error);
        throw error;
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

    const csvHeader = 'Команды,Ссылка на матч,Подряд нулевых матчей команды 1,Подряд нулевых матчей команды 2\n';
    const csvBody = results.map(match =>
        `"${match.teams}","${match.url}",${match.team1ConsecutiveZeros},${match.team2ConsecutiveZeros}`
    ).join('\n');
    fs.writeFileSync(csvFile, csvHeader + csvBody, 'utf-8');
}

async function checkStatsPages(statUrls) {
    const options = new chrome.Options();
    // options.addArguments('--headless');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    const matchesWithZeros = [];

    try {
        for (const relativeUrl of statUrls) {
            try {
                await driver.get(relativeUrl);
                await driver.wait(until.elementLocated(By.css('body')), 10000);
                await driver.wait(until.elementLocated(By.css('.mstat__content')), 30000);
                await driver.sleep(Math.random() * 2000 + 2000);

                const lastBreadcrumb = await driver.findElement(By.css('.breadcrumbs li:last-child span[itemprop="name"]'));
                const teams = await lastBreadcrumb.getText();
                const tables = await driver.findElements(By.css('.ev-mstat-tbl'));
                
                if (tables.length < 2) {
                    console.log(`Skipping ${relativeUrl} - not enough match tables found`);
                    continue;
                }

                let team1ConsecutiveZeros = 0;
                let team2ConsecutiveZeros = 0;
                
                // Анализ матчей первой команды
                const team1Matches = await tables[0].findElements(By.css('.ev-mstat-ev'));
                console.log(`Found ${team1Matches.length} matches for team 1`);
                
                for (const match of team1Matches) {
                    const score = await match.findElement(By.xpath('./following-sibling::td[contains(@class, "score")]')).getText();
                    const finalScore = score.split('(')[0].trim();
                    console.log(`Team 1 match score: ${finalScore}`);
                    if (finalScore === '0:0') {
                        team1ConsecutiveZeros++;
                    } else {
                        break;
                    }
                }
                
                // Анализ матчей второй команды
                const team2Matches = await tables[1].findElements(By.css('.ev-mstat-ev'));
                console.log(`Found ${team2Matches.length} matches for team 2`);
                
                for (const match of team2Matches) {
                    const score = await match.findElement(By.xpath('./following-sibling::td[contains(@class, "score")]')).getText();
                    const finalScore = score.split('(')[0].trim();
                    console.log(`Team 2 match score: ${finalScore}`);
                    if (finalScore === '0:0') {
                        team2ConsecutiveZeros++;
                    } else {
                        break;
                    }
                }

                
                if (team1ConsecutiveZeros >= 2 || team2ConsecutiveZeros >= 2) {
                    matchesWithZeros.push({
                        teams: teams,
                        url: relativeUrl,
                        team1ConsecutiveZeros,
                        team2ConsecutiveZeros
                    });
                }
                
            } catch (error) {
                console.error(`Error processing URL ${relativeUrl}:`, error);
                continue;
            }
        }
    } catch (error) {
        console.error('Error checking stats pages:', error);
        throw error;
    } finally {
        await driver.quit();
    }

    return matchesWithZeros;
}

openBetCity()
    .then(response => {
        checkStatsPages(response).then(results => {
            console.log('Матчи с тремя и более 0:0:', results);
            saveResultsToJsonAndCsv(results);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
