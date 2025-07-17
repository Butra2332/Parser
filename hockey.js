import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseScore(matchText, scoreText, teamName) {
    // matchText: "Аделаида Адренелин - Брисбен Лайтнинг"
    // scoreText: "2:4 (2:1, 0:1, 0:2)"
    const [home, away] = matchText.split(' - ');
    const [homeGoals, awayGoals] = scoreText.split(' ')[0].split(':').map(Number);
    if (home.includes(teamName)) {
        return homeGoals;
    } else {
        return awayGoals;
    }
}

async function getAllHockeyLinks() {
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

        try {
            const closeButton = await driver.wait(until.elementLocated(By.css('.push-confirm .icon_close')), 5000);
            if (closeButton) {
                await closeButton.click();
                await driver.sleep(1000);
            }
        } catch (e) { }

        await driver.sleep(Math.random() * 2000 + 1000);

        const hockeyLink = await driver.wait(
            until.elementLocated(By.css('a[href="/ru/line/ice-hockey"]')),
            10000
        );

        await driver.wait(until.elementIsVisible(hockeyLink), 10000);
        await driver.sleep(1000);
        await hockeyLink.click();

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
        throw error;
    } finally {
        await driver.quit();
    }
}

async function parseHockeyGames(statUrls) {
    const options = new chrome.Options();
    options.addArguments('--start-maximized');
    // options.addArguments('--headless');

    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    const passedMatches = [];
    const failedLinks = [];
    let successLinksCount = 0;
    const totalLinksCount = statUrls.length;

    try {
        for (const url of statUrls) {
            try {
                await driver.get(url);
                await driver.wait(until.elementLocated(By.css('body')), 20000);
                await driver.sleep(Math.random() * 2000 + 2000);

                // Получаем названия команд из хлебных крошек
                const breadcrumbs = await driver.findElements(By.css('.breadcrumbs li span[itemprop="name"]'));
                const teamsText = await Promise.all(breadcrumbs.map(b => b.getText()));
                const matchTeams = teamsText[teamsText.length - 1]; // "Аделаида Адренелин - Мельбурн Мустангс"
                const [team1, team2] = matchTeams.split(' - ');

                // Получаем таблицы последних игр
                const tables = await driver.findElements(By.css('.ev-mstat-tbl'));
                if (tables.length < 2) throw new Error('Not enough tables for both teams');

                // Для каждой команды парсим последние 2 матча
                async function getLastTwoScores(table, teamName) {
                    const rows = await table.findElements(By.css('tr'));
                    let scores = [];
                    let found = 0;
                    for (let i = 0; i < rows.length && found < 2; i++) {
                        const tds = await rows[i].findElements(By.css('td'));
                        if (tds.length < 3) continue;
                        // Проверяем, что это строка с матчем
                        let matchText, scoreText;
                        try {
                            matchText = await tds[1].getText();
                            scoreText = await tds[2].getText();
                        } catch { continue; }
                        if (!matchText || !scoreText) continue;
                        // Проверяем, что в строке есть название команды
                        if (!matchText.includes(teamName)) continue;
                        scores.push(parseScore(matchText, scoreText, teamName));
                        found++;
                    }
                    return scores;
                }

                const team1Scores = await getLastTwoScores(tables[0], team1);
                const team2Scores = await getLastTwoScores(tables[1], team2);

                // Если хотя бы у одной команды оба последних матча = 0 голов — матч проходит
                const team1AllZero = team1Scores.length === 2 && team1Scores[0] === 0 && team1Scores[1] === 0;
                const team2AllZero = team2Scores.length === 2 && team2Scores[0] === 0 && team2Scores[1] === 0;

                if (team1AllZero || team2AllZero) {
                    passedMatches.push({
                        teams: matchTeams,
                        url,
                        team1LastTwo: team1Scores.join(','),
                        team2LastTwo: team2Scores.join(',')
                    });
                }
                successLinksCount++;
            } catch (error) {
                failedLinks.push({ link: url, error: error.message });
                continue;
            }
        }
    } catch (error) {
        throw error;
    } finally {
        await driver.quit();
    }

    return { passedMatches, totalLinksCount, successLinksCount, failedLinks };
}

function saveHockeyResultsToCsv(results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }
    const csvFile = path.join(resultsDir, `hockey_matches_${timestamp}.csv`);
    const csvHeader = 'Команды, Ссылка на матч, Последние 2 матча команды 1, Последние 2 матча команды 2\n';
    const csvBody = results.map(match =>
        `"${match.teams}","${match.url}","${match.team1LastTwo}","${match.team2LastTwo}`
    ).join('\n');
    fs.writeFileSync(csvFile, csvHeader + csvBody, 'utf-8');
}

function saveHockeyReportToCsv(totalLinksCount, successLinksCount, failedLinks) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }
    const reportFile = path.join(resultsDir, `hockey_report_${timestamp}.csv`);
    let csvContent = 'Метрика,Значение\n';
    csvContent += `Total Links,${totalLinksCount}\n`;
    csvContent += `Success Links,${successLinksCount}\n`;
    csvContent += `Failed Links Count,${failedLinks?.length}\n`;
    if (failedLinks?.length > 0) {
        csvContent += '\nНеудачные ссылки,Ошибка\n';
        failedLinks.forEach(item => {
            csvContent += `"${item.link}","${item.error.replace(/"/g, '')}"\n`;
        });
    }
    fs.writeFileSync(reportFile, csvContent, 'utf-8');
}

export { getAllHockeyLinks, parseHockeyGames, saveHockeyResultsToCsv, saveHockeyReportToCsv };