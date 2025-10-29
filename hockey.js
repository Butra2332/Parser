import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import chromedriver from 'chromedriver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveChromeBinaryPath() {
    const envCandidates = [process.env.CHROME_BIN, process.env.CHROME_PATH].filter(Boolean);
    const defaultCandidates = [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
    const candidates = [...envCandidates, ...defaultCandidates];
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch {}
    }
    return null;
}

function parseScore(matchText, scoreText, teamName) {
    const [home, away] = matchText.split(' - ').map(s => s.trim().toLowerCase());
    const [homeGoals, awayGoals] = scoreText.split(' ')[0].split(':').map(Number);
    const team = teamName.trim().toLowerCase();
    if (home === team) {
        return homeGoals;
    } else if (away === team) {
        return awayGoals;
    } else {
        return null;
    }
}

async function getAllHockeyLinks() {
  const options = new chrome.Options();
    
    const chromeBinary = resolveChromeBinaryPath();
    if (chromeBinary) {
        options.setChromeBinaryPath(chromeBinary);
    }

    // Обязательные флаги для CI/CD среды
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox'); 
    options.addArguments('--disable-dev-shm-usage');
    
    // Дополнительные флаги для стабильности
    options.addArguments('--disable-gpu'); 
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--disable-extensions');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--disable-dev-shm-usage'); // Повторение, но важно

    const ciChromedriverPath = process.env.CHROMEDRIVER_PATH;
    const serviceBuilder = ciChromedriverPath
        ? new chrome.ServiceBuilder(ciChromedriverPath)
        : (process.env.USE_NPM_CHROMEDRIVER === '1' && chromedriver?.path)
            ? new chrome.ServiceBuilder(chromedriver.path)
            : undefined;
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(serviceBuilder)
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

async function getLastTwoScores(table, teamName) {
    const rows = await table.findElements(By.css('tr'));
    let scores = [];
    let i = 0;
    while (i < rows.length && scores.length < 2) {
        const tds = await rows[i].findElements(By.css('td'));
        if (tds.length === 2) {
            let matchText, scoreText;
            try {
                matchText = await tds[0].getText();
                scoreText = await tds[1].getText();
            } catch { i++; continue; }

            if (!matchText || !scoreText || !matchText.includes(' - ')) { i++; continue; }

            const goals = parseScore(matchText, scoreText, teamName);

            if (typeof goals === 'number' && !isNaN(goals)) {
                scores.push(goals);
            }
        }
        i++;
    }

    return scores;
}

async function parseHockeyGames(statUrls) {
    const options = new chrome.Options();
    const chromeBinary = resolveChromeBinaryPath();
    if (chromeBinary) {
        options.setChromeBinaryPath(chromeBinary);
    }
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--disable-extensions');
    options.addArguments('--disable-setuid-sandbox');

    const ciChromedriverPath2 = process.env.CHROMEDRIVER_PATH;
    const serviceBuilder2 = ciChromedriverPath2
        ? new chrome.ServiceBuilder(ciChromedriverPath2)
        : (process.env.USE_NPM_CHROMEDRIVER === '1' && chromedriver?.path)
            ? new chrome.ServiceBuilder(chromedriver.path)
            : undefined;
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .setChromeService(serviceBuilder2)
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

                const tables = await driver.findElements(By.css('.ev-mstat-tbl'));
                
                let team1 = '', team2 = '';
                let team1Scores = [], team2Scores = [];

                if (tables[0]) {
                    const team1Header = await tables[0].findElement(By.css('tr td.title')).getText();
                    const team1Match = team1Header.match(/Последние игры\s*(.*)/i);
                    team1 = team1Match ? team1Match[1].replace(':', '').trim() : team1Header.trim();
                    team1Scores = await getLastTwoScores(tables[0], team1);
                }
                if (tables[1]) {
                    const team2Header = await tables[1].findElement(By.css('tr td.title')).getText();
                    const team2Match = team2Header.match(/Последние игры\s*(.*)/i);
                    team2 = team2Match ? team2Match[1].replace(':', '').trim() : team2Header.trim();
                    team2Scores = await getLastTwoScores(tables[1], team2);
                }

                let matchTeams = '';
                try {
                    const breadcrumbs = await driver.findElements(By.css('.breadcrumbs li span[itemprop="name"]'));
                    const teamsText = await Promise.all(breadcrumbs.map(b => b.getText()));
                    matchTeams = teamsText[teamsText.length - 1];
                } catch { matchTeams = `${team1} - ${team2}`; }

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