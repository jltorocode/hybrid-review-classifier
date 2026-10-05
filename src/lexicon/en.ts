import { type Lexicon, terms } from './types';

export const en: Lexicon = {
  language: 'en',
  terms: [
    // Bugs that stop people from playing or cost them progress.
    ...terms('bug', -1.5, [
      'crash*', 'ctd', 'won\'t launch', 'wont launch', 'won\'t start', 'wont start', 'doesn\'t launch',
      'doesn\'t start', 'does not launch', 'does not start', 'can\'t launch', 'cant launch', 'can\'t start',
      'fails to launch', 'not launching', 'black screen', 'stuck on loading', 'stuck on the loading',
      'infinite loading', 'loading forever', 'lost my save', 'lost my progress', 'lost all my progress', 'lost progress', 'progress lost', 'hours of progress',
      'save got corrupted', 'corrupted save', 'save file corrupted', 'save is gone', 'progress was wiped',
      'progress got wiped', 'progress reset', 'wiped my save', 'deleted my save', 'softlock*', 'soft lock*',
      'hardlock*', 'game breaking', 'gamebreaking', 'unplayable', 'can\'t progress', 'cant progress',
      'can\'t continue', 'stuck forever', 'blue screen', 'bsod', 'closes itself', 'closes by itself',
      'kicks me to desktop', 'back to desktop', 'to the desktop', 'freezes my pc', 'charged twice',
      'didn\'t receive', 'never received', 'payment failed', 'purchase failed', 'paid but', 'never show up',
      'never showed up', 'doesn\'t show up', 'don\'t show up', 'not showing up', 'dlc not', 'dlc is missing',
    ], 'high'),
    // Everyday bugs.
    ...terms('bug', -1, [
      'bug*', 'buggy', 'glitch*', 'freez*', 'frozen', 'lag*', 'stutter*', 'fps drop*', 'frame drop*',
      'low fps', 'performance issues', 'error', 'errors', 'not working', 'doesn\'t work', 'does not work',
      'don\'t work', 'stopped working', 'isn\'t working', 'broken', 'clipping', 'fell through', 'fall through',
      'desync*', 'disconnect*', 'won\'t load', 'doesn\'t load', 'not loading', 'missing texture*',
      'texture* missing', 'flicker*', 'audio cuts', 'no sound', 'sound cuts', 'controller doesn\'t',
      'controller not', 'keybind*', 'resets my settings', 'doesn\'t save', 'not saving', 'won\'t save',
      'achievement* not', 'achievement* don\'t', 'not unlocking', 'typo', 'untranslated', 'overlapping text',
      'text overlaps', 'memory leak', 'input lag', 'hitbox*', 'exploit', 'clips through', 'clip through',
      'clipped through', 'clipping through', 'floating in the air', 'floats in the air', 'stuck in the wall',
      'stuck inside', 'loading screen', 'loading times', 'load times', 'long loading', 'pops in', 'pop-in',
      'fps tanks', 'fps drops to', 'audio desync', 'out of sync',
    ]),
    // Questions phrased without a question mark still count.
    ...terms('question', 0, [
      'how do i', 'how do you', 'how can i', 'how to', 'is there a way', 'is there any', 'is there gonna',
      'will there be', 'when will', 'when is', 'when does', 'does anyone know', 'anyone know', 'any plans',
      'any news', 'are you planning', 'do you plan', 'can i play', 'where can i', 'where do i',
      'what does', 'what is the', 'is it possible', 'is this game', 'does this game', 'does it have',
      'does it support', 'do i need', 'can someone', 'quick question', 'question:',
    ]),
    ...terms('suggestion', 0.3, [
      'please add', 'pls add', 'plz add', 'you should add', 'should add', 'should have', 'should be able',
      'would be nice', 'would be great', 'would be cool', 'would be awesome', 'it would be', 'would love',
      'i\'d love', 'it\'d be', 'i wish', 'wish there', 'needs more', 'need more', 'needs a', 'add an option',
      'an option to', 'add a', 'add more', 'consider adding', 'you should', 'you guys should', 'devs should', 'they should',
      'would pay for', 'i\'d pay for', 'i would pay for', 'i\'d recommend adding', 'would recommend adding', 'could you add', 'can you add', 'hope you add',
      'hope they add', 'feature request', 'suggestion', 'suggest*', 'idea:', 'my idea', 'how about',
      'what about adding', 'please make', 'please let', 'needs an option', 'missing feature',
    ]),
    // Praise.
    ...terms('praise', 3, [
      'masterpiece', 'game of the year', 'goty', 'best game', 'best games', 'one of the best', 'perfect',
      '10/10', 'must play', 'must buy', 'must have', 'absolute banger', 'banger', 'peak', 'goated', 'gem',
      'hidden gem', 'love it', 'love this', 'loved it', 'loving it', 'i love', 'so good', 'incredible',
      'phenomenal', 'outstanding', 'flawless', 'impossible to put down', 'hard to put down',
      'can\'t put it down', 'cant put it down', 'would buy', 'day one', 'day 1', 'insta buy', 'instabuy', 'shut up and take my money', 'take my money', 'bug free',
      'bug-free', 'no bugs', 'zero bugs', 'crash free', 'runs flawlessly', 'runs perfectly',
    ]),
    ...terms('praise', 2, [
      'love', 'loved', 'amazing', 'awesome', 'great', 'fantastic', 'excellent', 'brilliant', 'beautiful',
      'gorgeous', 'stunning', 'wonderful', 'superb', 'addictive', 'addicting', 'fun', 'enjoy*', 'recommend*',
      'would recommend', 'highly recommend', 'worth it', 'worth every', 'worth the', 'well worth', 'charming',
      'polished', 'satisfying', 'immersive', 'buy it', 'just buy it', 'go buy it', 'what more can i say',
      'what else can i say', 'what more could you want', 'you should buy', 'you won\'t regret', 'cozy', 'wholesome', 'underrated', 'impressive', 'blast',
      'had a blast', 'can\'t stop playing', 'cant stop playing', 'hooked', 'favorite', 'favourite', 'thank you',
      'thanks for', 'thanks devs', 'kudos', 'well done', 'good job', 'great job', 'nailed it', 'keep it up',
      'keep up the good work', 'bought it again', 'would buy again', 'would play again', 'fire',
    ]),
    ...terms('praise', 1, [
      'good', 'nice', 'cool', 'solid', 'decent', 'pretty good', 'fine', 'neat', 'cute', 'relaxing', 'smooth',
      'runs well', 'runs great', 'like it', 'liked it', 'i like', 'enjoyable', 'unique', 'creative',
      'interesting', 'clever',
    ]),
    // Complaints: unhappy, but nothing is broken.
    ...terms('complaint', -3, [
      'waste of money', 'waste of time', 'complete waste', 'can\'t recommend', 'cannot recommend', 'cant recommend',
      'wouldn\'t recommend', 'would not recommend', 'don\'t recommend', 'do not recommend', 'not recommended', 'worst game', 'scam', 'cash grab', 'cashgrab',
      'rip off', 'ripoff', 'garbage', 'trash', 'dogshit', 'unacceptable', 'do not buy', 'don\'t buy',
      'dont buy', 'avoid',
    ]),
    ...terms('complaint', -2, [
      'not worth', 'isn\'t worth', 'overpriced', 'too expensive', 'boring', 'bored', 'repetitive',
      'disappoint*', 'terrible', 'awful', 'horrible', 'bad', 'hate', 'pay to win', 'pay2win', 'p2w',
      'microtransaction*', 'predatory', 'lootbox*', 'loot box*', 'abandoned', 'dead game', 'refund*',
      'refunded', 'regret', 'unfair', 'frustrating', 'annoying', 'tedious', 'grindy', 'grind', 'lazy',
      'soulless', 'no content', 'not enough content', 'misleading', 'false advertising', 'clunky',
      'ugly', 'sucks', 'mid', 'meh', 'lame', 'mediocre', 'underwhelming', 'pointless', 'uninstall*',
      'went downhill', 'ruined', 'nerf*', 'wait for a sale', 'wait for a discount', 'buy it on sale', 'only on sale',
      'palette swap', 'reskin*', 'copy paste', 'copy-paste', 'copy pasted', 'recycled', 'floaty', 'inconsistent',
      'unresponsive', 'imprecise', 'fights you', 'absurd', 'nearly impossible', 'almost impossible', 'impossible',
      'motion sick*', 'money back', 'they removed', 'removed the', 'why would you', 'why did you', 'but barely',
      'janky', 'dumbed down', 'too short', 'too hard', 'too easy', 'too difficult', 'too slow',
      'too long', 'too grindy', 'way too', 'unbalanced', 'broken balance',
    ]),
    ...terms('complaint', -1, [
      'expensive', 'pricey', 'short', 'slow', 'confusing', 'not much', 'lacking', 'lacks', 'needs work',
      'could be better', 'not great', 'not good', 'not fun', 'not for me', 'wish it was',
      'only problem', 'only issue', 'my only complaint',
    ]),
    // Toxic: aimed at people, not at the game.
    ...terms('toxic', -2, [
      'idiot*', 'moron*', 'imbecile*', 'clowns', 'stupid devs', 'dumb devs', 'lazy devs are', 'devs are idiots',
      'f*ck you', 'fuck you', 'fuck u', 'fuck off', 'screw you', 'shut up', 'loser*', 'pathetic devs',
      'go to hell', 'piece of shit', 'pos devs', 'retard*', 'braindead devs', 'people like you', 'snowflake*',
      'go bankrupt', 'goes bankrupt', 'hope you fail', 'hope your studio', 'imagine being so',
    ], 'medium'),
    ...terms('toxic', -3, [
      'kill yourself', 'kys', 'hope you die', 'go die', 'i will find you', 'i know where you live',
      'die in a fire', 'gonna kill', 'i\'ll kill', 'should be shot', 'burn your studio', 'deserves to die',
      'burn down', 'i know where'
    ], 'high'),
    // Spam and self promotion.
    ...terms('spam', 0, [
      'check out my channel', 'check my channel', 'subscribe to my', 'sub to my', 'sub4sub', 'follow me',
      'follow my', 'free skins', 'free v-bucks', 'free vbucks', 'free robux', 'free gift card', 'giveaway',
      'promo code', 'discount code', 'cheap keys', 'buy cheap', 'earn money', 'make money', 'earn $',
      'crypto', 'bitcoin', 'nft', 'airdrop', 'dm me', 'click here', 'click the link', 'link in bio',
      'visit my', 'whatsapp', 'telegram', 'onlyfans', 'buy followers', 'buy viewers', 'free followers',
      'cheap followers', 'with code', 'use code', 'use my code', 'promo',
    ]),
    // Tone without a category.
    ...terms(null, 0.7, ['lol', 'lmao', 'haha', 'hahaha', 'thx']),
    ...terms(null, -1, ['ugh', 'sadly', 'unfortunately', 'wtf', 'what a shame']),
  ],
  negators: [
    'not', 'no', 'never', 'without', 'zero', 'nothing', 'none', 'hardly', 'barely', 'don\'t', 'dont',
    'doesn\'t', 'doesnt', 'didn\'t', 'didnt', 'isn\'t', 'isnt', 'wasn\'t', 'wasnt', 'aren\'t', 'arent',
    'won\'t', 'can\'t', 'cant', 'haven\'t', 'hasn\'t', 'neither', 'nor',
  ],
  intensifiers: [
    'very', 'really', 'so', 'super', 'extremely', 'absolutely', 'insanely', 'incredibly', 'truly', 'fucking',
    'freaking', 'damn', 'totally', 'completely', 'highly', 'most', 'such', 'too',
  ],
  contrast: ['but', 'however', 'though', 'although', 'yet', 'except', 'that said'],
  concession: ['at least', 'the only good', 'only good thing', 'the only thing', 'only redeeming'],
  mitigators: [
    'once', 'only once', 'rarely', 'sometimes', 'occasional*', 'minor', 'small', 'tiny', 'a bit', 'slightly',
    'a few', 'some', 'a couple',
  ],
  hypothetical: ['would', 'could', 'if', 'wish', 'hope', 'if only', 'it\'d', 'would\'ve', 'imagine'],
  questionStarters: [
    'how', 'what', 'when', 'where', 'why', 'who', 'which', 'is', 'are', 'does', 'do', 'did', 'can', 'could',
    'will', 'would', 'should', 'has', 'have', 'any', 'anyone', 'anybody',
  ],
  stopwords: [
    'the', 'and', 'is', 'it', 'to', 'of', 'a', 'in', 'that', 'this', 'for', 'you', 'with', 'was', 'but',
    'not', 'are', 'game', 'have', 'be', 'on', 'my', 'i', 'so', 'just', 'it\'s', 'its', 'can', 'very',
    'play', 'they', 'if', 'what', 'there', 'about', 'would', 'get', 'when', 'like', 'really', 'much',
    'great', 'good', 'fun', 'only', 'after', 'hours', 'please', 'how', 'does', 'don\'t', 'than', 'too',
    'me', 'from', 'their', 'your', 'we', 'our', 'he', 'she', 'them', 'will', 'do', 'an', 'or', 'as', 'at',
    'by', 'all', 'one', 'more', 'been', 'had', 'has', 'were', 'who', 'every', 'some', 'it\'s', 'i\'m', 'i\'ve',
  ],
};
