import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

async function openBetCity() {
    const options = new chrome.Options();
    options.addArguments('--start-maximized'); // Start with maximized window
    
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    try {
        console.log('Opening BetCity website...');
        await driver.get('https://betcity.by/ru');
        
        console.log('Waiting for football link...');
        const footballLink = await driver.wait(
            until.elementLocated(By.css('a[href="/ru/line/soccer"]')),
            10000
        );
        
        await driver.wait(until.elementIsVisible(footballLink), 10000);
        await footballLink.click();
        
        // Ждем появления первого dropdown вместо фиксированной задержки
        console.log('Looking for first app-select (48 hours)...');
        const periodSelect = await driver.wait(
            until.elementLocated(By.css('app-select[name="selectedPeriod"]')),
            10000
        );
        
        await driver.executeScript('arguments[0].scrollIntoView(true);', periodSelect);
        await driver.sleep(500);
        
        console.log('Clicking first app-select...');
        await periodSelect.click();
        await driver.sleep(500);
        
        // Set 48 hours
        const success = await driver.executeScript(`
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
        
        // Second dropdown - alphabetical sorting
        console.log('Looking for second app-select (sorting)...');
        
        // Find all app-select elements and get the one with sorting options
        const sortingSuccess = await driver.executeScript(`
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
        
        // Click on "Все события" checkbox
        console.log('Looking for "Все события" checkbox...');
        const allEventsCheckbox = await driver.wait(
            until.elementLocated(By.xpath('//div[contains(@class, "champs__champ_all")]')),
            10000
        );
        
        // Scroll to the checkbox
        await driver.executeScript('arguments[0].scrollIntoView(true);', allEventsCheckbox);
        await driver.sleep(500);
        
        // Click the checkbox
        console.log('Clicking "Все события" checkbox...');
        await allEventsCheckbox.click();
        
        await driver.sleep(500);
        
        const showButton = await driver.wait(
            until.elementLocated(By.css('button.line__controls-button')),
            10000
        );
        
        // Scroll to the button and click
        await driver.executeScript('arguments[0].scrollIntoView(true);', showButton);
        await driver.sleep(500);
        
        await showButton.click();
        
        // Wait to see the results
        await driver.sleep(1000);
        
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        console.log('Closing browser...');
        await driver.quit();
    }
}

openBetCity().catch(console.error);