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
    
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    try {
        await driver.get('https://betcity.by/ru');
        await driver.wait(until.elementLocated(By.css('body')), 10000);
        
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

    const csvHeader = 'Команды, Ссылка на матч, Подряд нулевых матчей команды 1, Подряд нулевых матчей команды 2\n';
    const csvBody = results.map(match =>
        `"${match.teams}","${match.url}",${match.team1ConsecutiveZeros},${match.team2ConsecutiveZeros}`
    ).join('\n');
    fs.writeFileSync(csvFile, csvHeader + csvBody, 'utf-8');
}

// Новая функция для сохранения отчета о выполнении в CSV
function saveReportToCsv(totalLinksCount, successLinksCount, failedLinks) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = path.join(__dirname, 'results');

    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const reportFile = path.join(resultsDir, `report_${timestamp}.csv`);

    let csvContent = 'Метрика,Значение\n';
    csvContent += `Total Links,${totalLinksCount}\n`;
    csvContent += `Success Links,${successLinksCount}\n`;
    csvContent += `Failed Links Count,${failedLinks.length}\n`;

    if (failedLinks.length > 0) {
        csvContent += '\nНеудачные ссылки,Ошибка\n';
        failedLinks.forEach(item => {
            csvContent += `"${item.link}","${item.error.replace(/"/g, '')}"\n`; // Экранируем кавычки в сообщении об ошибке
        });
    }

    fs.writeFileSync(reportFile, csvContent, 'utf-8');
    console.log(`Report saved to: ${reportFile}`);
}

async function checkStatsPages(statUrls) {
    const options = new chrome.Options();
    options.addArguments('--start-maximized');
    // options.addArguments('--headless');

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    const matchesWithZeros = [];
    const failedLinks = [];
    let successLinksCount = 0;
    const totalLinksCount = statUrls.length;

    try {
        for (const relativeUrl of statUrls) {
            try {
                await driver.get(relativeUrl);
                await driver.wait(until.elementLocated(By.css('body')), 10000);
                await driver.wait(until.elementLocated(By.css('.mstat__content')), 10000);
                await driver.sleep(Math.random() * 2000 + 2000);

                const lastBreadcrumb = await driver.findElement(By.css('.breadcrumbs li:last-child span[itemprop="name"]'));
                const teams = await lastBreadcrumb.getText();
                const tables = await driver.findElements(By.css('.ev-mstat-tbl'));
                
                let team1ConsecutiveZeros = 0;
                let team2ConsecutiveZeros = 0;
                
                if (tables[0]) {
                    const team1Matches = await tables[0].findElements(By.css('.ev-mstat-ev'));
                    for (const match of team1Matches) {
                        const score = await match.findElement(By.xpath('./following-sibling::td[contains(@class, "score")]')).getText();
                        const finalScore = score.split('(')[0].trim();
                        if (finalScore === '0:0') {
                            team1ConsecutiveZeros++;
                        } else {
                            team1ConsecutiveZeros = 0;
                        }
                    }
                }
                
                if (tables[1]) {
                    const team2Matches = await tables[1].findElements(By.css('.ev-mstat-ev'));
                    for (const match of team2Matches) {
                        const score = await match.findElement(By.xpath('./following-sibling::td[contains(@class, "score")]')).getText();
                        const finalScore = score.split('(')[0].trim();
                        if (finalScore === '0:0') {
                            team2ConsecutiveZeros++;
                        } else {
                            team2ConsecutiveZeros = 0;
                        }
                    }
                }

                if (team1ConsecutiveZeros >= 3 || team2ConsecutiveZeros >= 3) {
                    matchesWithZeros.push({
                        teams: teams,
                        url: relativeUrl,
                        team1ConsecutiveZeros,
                        team2ConsecutiveZeros
                    });
                }
                successLinksCount++;
            } catch (error) {
                failedLinks.push({ link: relativeUrl, error: error.message });
                continue;
            }
        }
    } catch (error) {
        throw error;
    } finally {
        await driver.quit();
    }

    return { matchesWithZeros, totalLinksCount, successLinksCount, failedLinks };
}

openBetCity()
    .then(response => {
        checkStatsPages(response).then(results => {
            saveResultsToJsonAndCsv(results.matchesWithZeros);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
