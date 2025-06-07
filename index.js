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
    options.addArguments('--headless');

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    return driver;
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
            // Правильное экранирование кавычек в JavaScript для CSV
            // Заменяем " на "" внутри строки, которая сама в кавычках
            const escapedError = item.error.replace(/"/g, '""');
            csvContent += `"${item.link}","${escapedError}"\n`;
        });
    }

    fs.writeFileSync(reportFile, csvContent, 'utf-8');
    console.log(`Report saved to: ${reportFile}`);
}

async function checkStatsPages(driver, statUrls) {
    const matchesWithZeros = [];
    const failedLinks = [];
    let successLinksCount = 0;
    const totalLinksCount = statUrls.length;

    try {
        for (const relativeUrl of statUrls) {
            try {
                console.log(`Processing URL: ${relativeUrl}`);
                await driver.get(relativeUrl);
                await driver.wait(until.elementLocated(By.css('body')), 10000);
                await driver.wait(until.elementLocated(By.css('.mstat__content')), 30000);
                await driver.sleep(Math.random() * 2000 + 2000);

                // Получаем названия команд из последнего элемента breadcrumbs
                const lastBreadcrumb = await driver.findElement(By.css('.breadcrumbs li:last-child span[itemprop="name"]'));
                const teams = await lastBreadcrumb.getText();
                console.log(`Found teams: ${teams}`);
                const tables = await driver.findElements(By.css('.ev-mstat-tbl'));
                console.log(`Found ${tables.length} match tables`);
                
                let team1ConsecutiveZeros = 0;
                let team2ConsecutiveZeros = 0;
                
                if (tables[0]) {
                    const team1Matches = await tables[0].findElements(By.css('.ev-mstat-ev'));
                    console.log(`Found ${team1Matches.length} matches for team 1`);
                    for (const match of team1Matches) {
                        const score = await match.findElement(By.xpath('./following-sibling::td[contains(@class, "score")]')).getText();
                        const finalScore = score.split('(')[0].trim();
                        console.log(`Team 1 match score: ${finalScore}`);
                        if (finalScore === '0:0') {
                            team1ConsecutiveZeros++;
                        } else {
                            team1ConsecutiveZeros = 0;
                        }
                    }
                } else {
                    console.log(`Team 1 table not found for URL: ${relativeUrl}`);
                }
                
                if (tables[1]) {
                    const team2Matches = await tables[1].findElements(By.css('.ev-mstat-ev'));
                    console.log(`Found ${team2Matches.length} matches for team 2`);
                    for (const match of team2Matches) {
                        const score = await match.findElement(By.xpath('./following-sibling::td[contains(@class, "score")]')).getText();
                        const finalScore = score.split('(')[0].trim();
                        if (finalScore === '0:0') {
                            team2ConsecutiveZeros++;
                        } else {
                            team2ConsecutiveZeros = 0;
                        }
                    }
                } else {
                    console.log(`Team 2 table not found for URL: ${relativeUrl}`);
                }

                console.log(`Analyzing ${teams}:`);
                console.log(`Team 1 consecutive zeros: ${team1ConsecutiveZeros}`);
                console.log(`Team 2 consecutive zeros: ${team2ConsecutiveZeros}`);
                
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
        // Драйвер будет закрыт в функции main
    }

    return { matchesWithZeros, totalLinksCount, successLinksCount, failedLinks };
}

async function main() {
    const driver = await openBetCity();
    try {


        const results = await checkStatsPages(driver, statLinks);
        console.log('Matches with 3+ consecutive 0:0:', results.matchesWithZeros);
        saveResultsToJsonAndCsv(results.matchesWithZeros);
        saveReportToCsv(results.totalLinksCount, results.successLinksCount, results.failedLinks);
    } catch (error) {
        console.error('Error in main function:', error);
        process.exit(1);
    } finally {
        if (driver) {
            await driver.quit();
        }
    }
}

main();