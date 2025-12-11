import { getAllSoccerLinks, parseSoccerGames, saveResultsToCsv, saveReportToCsv } from './soccer.js';
import { getAllHockeyLinks, parseHockeyGames, saveHockeyResultsToCsv, saveHockeyReportToCsv } from './hockey.js';

(async () => {
    try {
        const soccerLinks = await getAllSoccerLinks();
        const soccerResults = await parseSoccerGames(soccerLinks);
        saveResultsToCsv(soccerResults.matchesWithZeros);
        saveReportToCsv(soccerResults.totalLinksCount, soccerResults.successLinksCount, soccerResults.failedLinks);

        
        const hockeyLinks = await getAllHockeyLinks();
        const hockeyResults = await parseHockeyGames(hockeyLinks);
        saveHockeyResultsToCsv(hockeyResults.passedMatches);
        saveHockeyReportToCsv(hockeyResults.totalLinksCount, hockeyResults.successLinksCount, hockeyResults.failedLinks);
    } catch (error) {
        process.exit(1);
    }
})();