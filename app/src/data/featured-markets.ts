// Market ids (MarketFactory index) the Gas Killer demo lists on the markets page.
// The Sepolia factory holds 42 markets, 37 of them on the 2028 US presidential race;
// the demo shows six of those plus the other questions still open (the Fed and
// Bitcoin markets, ids 0 and 1, passed their deadlines). Hidden markets stay
// reachable at /market/:id.
export const FEATURED_MARKET_IDS: ReadonlySet<number> = new Set([
  // 2028 US presidential race
  41, // Elise Stefanik, Republican nomination
  26, // John Thune, Republican nomination
  14, // Tim Walz, Democratic nomination
  36, // Raphael Warnock, Democratic nomination
  24, // Vivek Ramaswamy, election
  29, // Greg Abbott, election
  // other questions
  2, // US invades Iran by Dec 31, 2026
  21, // China invades Taiwan by Dec 31, 2026
  34, // Richard Grenell leads Venezuela by Dec 31, 2026
]);
