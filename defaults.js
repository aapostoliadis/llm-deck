// LLM Deck: every setting and its default, in one place.
// Your config.json only needs the values you've changed; anything missing comes from here.
module.exports = {
  port: 7777,
  city: 'London', latitude: 51.51, longitude: -0.13,   // used for the weather; change in config.json

  // cards
  pinnedProjects: [],
  readyMinTurnSeconds: 30,      // shorter Claude Code turns don't count as a new result
  backgroundHours: 24,          // how far back the server looks for sessions
  olderHours: 3,                // idle cards older than this fold under "Show older"
  chatRecents: 8,               // recent chats shown per desktop app
  notifHours: 12,               // how long a notification can mark a chat as new
  staleMinutes: 30,             // remind again after a request waits this long
  groups: {
    'Website': ['website', 'landing page'],
    'Mobile app': ['\\bios\\b', 'android', 'mobile'],
    'Docs': ['\\bdocs?\\b', 'readme']
  },

  // permissions and replies
  deckPermissions: true,
  deckQuestions: true,
  deskAware: true,             // when you're at your computer, prompts go straight to the app
  deskActiveSeconds: 60,       // 'at your computer' means keyboard or mouse used this recently         // show an agent's multiple-choice questions on the deck
  questionWaitSeconds: 120,    // then hand the question back to the app
  permWaitSeconds: 600,
  quickReplies: ['Yes, continue', 'Go with your suggestion', 'Stop here for now'],

  // alerts and screen
  updateCheck: false,          // once a day, ask GitHub whether a newer release is out (opt-in)
  usageCheck: false,           // check Claude's limits every few minutes with your Claude Code sign-in (opt-in)
  usageCheckMinutes: 5,
  alertSound: true,
  quietHours: '23:00-07:00',
  autoTheme: true,
  dimAtNight: true,
  dimAfterMinutes: 10,
  pixelShift: true,

  // phone access stays off until switched on in Settings
  remoteAccess: false,

  // background work
  officialLimitsMinutes: 15,
  chatPollSeconds: 4,
  desktopChats: true,
  notifications: true,        // read Claude and Codex notifications
  codex: true,

  // fallback limit estimates and API price table (used only when official limits are unavailable)
  fiveHourBudgetUSD: 250,
  weeklyBudgetUSD: 1500,
  weeklyReset: '',
  pricing: [
    { match: 'opus-4-1|opus-4-2025|opus-4@|3-opus', input: 15, output: 75 },
    { match: 'opus|fable|mythos', input: 5, output: 25 },
    { match: 'sonnet', input: 3, output: 15 },
    { match: 'haiku-3', input: 0.8, output: 4 },
    { match: 'haiku', input: 1, output: 5 }
  ],
  fallbackPricing: { input: 5, output: 25 }
};
