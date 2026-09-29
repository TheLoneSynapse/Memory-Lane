/**
 * Seed content for the Memory Lane API.
 *
 * This is the single source of truth for the people, photo stories, the
 * default "today" schedule, the upcoming events and the home-page
 * reflections that previously lived in the frontend (src/data/*.ts).
 */

/** Where a captured photo can be kept. Matches MemoryDestination in the app. */
export const DESTINATIONS = ["home", "faces", "stories"];

export function createSeed() {
  return {
    schemaVersion: 1,
    // The person using the app: filled in by the welcome step, empty until
    // then. Kept here so a brand-new store answers GET /api/profile with an
    // object rather than nothing at all.
    profile: { name: "", preferredName: "", about: "" },
    people: [
      {
        id: "ellen",
        name: "Ellen",
        relationship: "Your daughter",
        initials: "EL",
        gradient: "linear-gradient(135deg, #C97B3A 0%, #A3542E 100%)",
        bio: "Ellen is your daughter. She lives a short walk away, in the little house with the yellow door, and every Sunday she arrives with warm bread and news of the week. She says she comes for the shortbread, but you both know better.",
        lastMet: "Last Sunday, when she stayed for lunch and fell asleep in your armchair.",
        loves: ["banana bread", "her rose garden", "long phone calls", "puzzles"],
        conversationStarter:
          "Ellen thinks she keeps her recipe for sponge cake a secret — ask her about it over a cup of tea, and watch her grin.",
        photos: [
          {
            label: "Sunday lunch",
            gradient: "linear-gradient(135deg, #D9A441 0%, #A3661D 100%)",
          },
          {
            label: "The rose garden",
            gradient: "linear-gradient(135deg, #C97B3A 0%, #8F3C22 100%)",
          },
          {
            label: "The fair, 2019",
            gradient: "linear-gradient(135deg, #7C8C5E 0%, #4E5A3C 100%)",
          },
        ],
      },
      {
        id: "tom",
        name: "Tom",
        relationship: "Your husband",
        initials: "TM",
        gradient: "linear-gradient(135deg, #7C8A6E 0%, #4E5A42 100%)",
        bio: "Tom is your husband. You have been together for more than fifty years, since he danced over to you at the summer fair and told you he had been watching you all afternoon. He still gets that shy grin when he is caught looking.",
        lastMet: "This morning, at the kitchen table, over tea and toast.",
        loves: ["his allotment shed", "the river walk", "old radio songs", "Sunday roasts"],
        conversationStarter:
          "Tom pretends he has forgotten how to waltz, but steer him to the middle of the floor and his feet remember everything.",
        photos: [
          {
            label: "The bridge walk",
            gradient: "linear-gradient(135deg, #5C8A7A 0%, #2F5C4E 100%)",
          },
          {
            label: "Wedding day",
            gradient: "linear-gradient(135deg, #C97B3A 0%, #8F3C22 100%)",
          },
          {
            label: "Tending the garden",
            gradient: "linear-gradient(135deg, #8C8A72 0%, #5C5A44 100%)",
          },
        ],
      },
      {
        id: "ruby",
        name: "Ruby",
        relationship: "Your granddaughter",
        initials: "RB",
        gradient: "linear-gradient(135deg, #D99A2E 0%, #A3661D 100%)",
        bio: "Ruby is your granddaughter, Ellen's daughter. She is studying design in the city and visits most Saturdays, always carrying a sketchbook and one question after another about your old photo albums. She says you are her best model.",
        lastMet: "Last Saturday, before she ran for the train with a sketch of you tucked in her coat.",
        loves: ["sketching", "second-hand bookshops", "raining on buses", "chocolate cookies"],
        conversationStarter:
          "Ruby drew you at the kitchen window in watercolour; ask to see the sketchbook page and she will show you how she mixes the light.",
        photos: [
          {
            label: "Sketching by the window",
            gradient: "linear-gradient(135deg, #B26E7A 0%, #7E4650 100%)",
          },
          {
            label: "Picnic last spring",
            gradient: "linear-gradient(135deg, #7C8A6E 0%, #4E5A42 100%)",
          },
          {
            label: "The city gallery",
            gradient: "linear-gradient(135deg, #5C7C93 0%, #3C5666 100%)",
          },
        ],
      },
      {
        id: "jamal",
        name: "Jamal",
        relationship: "Your chess friend",
        initials: "JM",
        gradient: "linear-gradient(135deg, #A3762D 0%, #6E4A33 100%)",
        bio: "Jamal is your chess friend from the community hall. He came to teach chess three years ago and you took to it quickly, so now the two of you play twice a week. He still refuses to admit that you have won more games.",
        lastMet: "Yesterday afternoon, in his house with a board already set up.",
        loves: ["chess endgames", "recorded jazz", "calling you 'champion'", "savoury pies"],
        conversationStarter:
          "Jamal keeps a list called the 'one match he cannot explain' and your name is on it — remind him of game forty-two and watch him prove it.",
        photos: [
          {
            label: "Game night at the hall",
            gradient: "linear-gradient(135deg, #A3762D 0%, #6E4A33 100%)",
          },
          {
            label: "Sidewalk chess, 2021",
            gradient: "linear-gradient(135deg, #7C8A6E 0%, #4E5A42 100%)",
          },
          {
            label: "Pie afternoon",
            gradient: "linear-gradient(135deg, #C97B3A 0%, #8F3C22 100%)",
          },
        ],
      },
      {
        id: "frank",
        name: "Frank",
        relationship: "Your neighbour across the road",
        initials: "FR",
        gradient: "linear-gradient(135deg, #8C8A72 0%, #5C5A44 100%)",
        bio: "Frank has lived across the road for over twenty years. He checks your fence after every storm, waves at exactly the same time each morning, and brings over the first tomatoes of summer with more pride than he shows for anything.",
        lastMet: "This morning, over the fence, complaining happily about the weather.",
        loves: ["his greenhouse", "crosswords", "the village pigeon loft", "loud cardigans"],
        conversationStarter:
          "Frank swears his carrots could calm a storm. Ask him to walk you through his secret and the greenhouse tour will last a full hour.",
        photos: [
          {
            label: "Over the fence",
            gradient: "linear-gradient(135deg, #8C8A72 0%, #5C5A44 100%)",
          },
          {
            label: "Tomato day, 2022",
            gradient: "linear-gradient(135deg, #C97B3A 0%, #8F3C22 100%)",
          },
          {
            label: "Shared garden wall",
            gradient: "linear-gradient(135deg, #7C8A6E 0%, #4E5A42 100%)",
          },
        ],
      },
      {
        id: "dorothy",
        name: "Dorothy",
        relationship: "Your oldest friend",
        initials: "DR",
        gradient: "linear-gradient(135deg, #B26E7A 0%, #7E4650 100%)",
        bio: "Dorothy is your oldest friend. You met in school and have not really stopped since. She still writes her letters in fountain-pen blue, and you keep every one in the tin on your cupboard, arranged by year, if she knew that she would cry.",
        lastMet: "Two days ago, for tea in her sunroom with both cats.",
        loves: ["fountain-pen letters", "fresh air", "sunflowers", "reading out the quiz"],
        conversationStarter:
          "Dorothy keeps your favourite 1973 poem tucked in her cookbook — ask her about 'the river lane' and she will finally confess she never knew what it meant.",
        photos: [
          {
            label: "The sunroom",
            gradient: "linear-gradient(135deg, #B26E7A 0%, #7E4650 100%)",
          },
          {
            label: "Summer letters",
            gradient: "linear-gradient(135deg, #5E7C93 0%, #3C5666 100%)",
          },
          {
            label: "The school gate, 1967",
            gradient: "linear-gradient(135deg, #8C8A72 0%, #5C5A44 100%)",
          },
        ],
      },
      {
        id: "david",
        name: "David",
        relationship: "Your grandson",
        initials: "DV",
        gradient: "linear-gradient(135deg, #5C7C93 0%, #3C5666 100%)",
        bio: "David is your grandson, Ellen's son. He is studying in the city and phones every Thursday without fail, mostly to tell you about circuits — but he also remembers the small things, like exactly which biscuit you take with your tea.",
        lastMet: "Last Thursday evening, on the phone after his dinner.",
        loves: ["little robots", "star charts", "computer gadgets", "workshops"],
        conversationStarter:
          "David is building a little clock that tells you who is coming to visit. Ask how it decided you liked warm light — the answer is more honest than he thinks.",
        photos: [
          {
            label: "Building the clock",
            gradient: "linear-gradient(135deg, #5C7C93 0%, #3C5666 100%)",
          },
          {
            label: "Backyard launch day",
            gradient: "linear-gradient(135deg, #7C8A6E 0%, #4E5A42 100%)",
          },
          {
            label: "The computer club",
            gradient: "linear-gradient(135deg, #A3762D 0%, #6E4A33 100%)",
          },
        ],
      },
    ],

    stories: [
      {
        id: "candles-and-clapping",
        title: "Candles and clapping",
        context: "Your birthday, in June",
        scene: "cake",
        // Serve-ready CSS gradient (the app paints it with an inline style so
        // colours can change without a rebuild).
        wash: "linear-gradient(to bottom right, #fbe3b8, #f6d3ae, #eebf9d)",
        story:
          "Everyone stopped talking the moment the cake came through the door — and then they all began to clap. The candles leaned every which way, a couple of them already dribbling wax. You leaned in, made a wish you have kept ever since, and blew them out to a whole round of applause. There was chocolate chip cake to last the rest of the week.",
      },
      {
        id: "beans-and-the-bees",
        title: "Beans and the bees",
        context: "Early summer, by the greenhouse",
        scene: "garden",
        wash: "linear-gradient(to bottom right, #e9edd6, #dde6c1, #c9d9a0)",
        story:
          "The runner beans grew so fast that summer you could barely see over the tops of them. You watered them every morning, while the bees hummed their approval among the orange flowers. When October came there were jars of beans on the shelf — the whole garden kept warm, the way it had felt in June.",
      },
      {
        id: "tea-by-the-back-window",
        title: "Tea by the back window",
        context: "A Tuesday, after the rain",
        scene: "tea",
        wash: "linear-gradient(to bottom right, #f4e7cd, #ecd8b6, #e1c69d)",
        story:
          "The rain had only just finished, and the garden was glistening. The kettle went on, out came the best cups — the ones with the gold rims — and the tin of shortbread you and Margaret always knew. You sat by the back window and talked about small, good things: the marigolds, the postman's hat, the day the cat fell in the pond. The tea somehow never went cold.",
      },
      {
        id: "two-rings-one-dance",
        title: "Two rings, one dance",
        context: "Your wedding day, in September",
        scene: "wedding",
        wash: "linear-gradient(to bottom right, #f6d9d2, #efc5bb, #e3ac9d)",
        story:
          "The church bells went on longer than anyone could remember, and the garden filled with people in hats they'd saved for the day. When the slow music started, you held on steady, the way you always would. They said the flowers were the finest that year — but you remember best the quiet minute before the dance, the two rings on the little velvet cushion, catching the light.",
      },
      {
        id: "the-robin-at-the-window",
        title: "The robin at the window",
        context: "Cold mornings, in November",
        scene: "robin",
        wash: "linear-gradient(to bottom right, #e7dfd1, #dbd0bb, #c9ba9c)",
        story:
          "Every cold morning the same little robin came, a small red chest at the sill. You kept crumbs in the saucer by the glass, and he learned to wait there when it was empty. He stayed all winter — and in the spring he brought a friend — which you always said was a very good omen.",
      },
      {
        id: "sunday-roast-plates",
        title: "Sunday plates, passed around",
        context: "Most Sundays, all year round",
        scene: "sunday",
        wash: "linear-gradient(to bottom right, #f2e0c6, #e8d0ae, #dabb8d)",
        story:
          "The table could barely manage it — the roast platter going hand to hand, the gravy jug making its rounds, somebody always asking for a second helping. You kept the strict count, so no one went without, not even the ones pretending they weren't hungry. The apple crumble went around twice, and by the time the washing-up was done, everyone had gone quiet in the way that means happy.",
      },
    ],

    home: {
      // "Memory of the day" is chosen from these, one per calendar day.
      moments: [
        {
          id: "moment-harbor",
          title: "The harbor, 2019",
          text: "You and Tom stood at the end of the pier for the whole ferry crossing. He told you the story of his first boat — again — and you let him, because he tells it best when the wind carries his voice.",
        },
        {
          id: "moment-yellow-door",
          title: "Ellen's yellow door",
          text: "The week you helped Ellen paint her door, she let you pick the colour. You chose yellow so that 'you could never miss your way home'. You both say it was the right call.",
        },
        {
          id: "moment-roses",
          title: "The roses, last June",
          text: "Dorothy brought over her first roses each summer; last year she cut nine and arranged them in the blue tin. You kept two petals in the book about the river.",
        },
      ],
    },

    defaultTodayEvents: [
      {
        id: "frank-wave",
        time: "8:30",
        headline: "Frank waves from across the road",
        description: "Tea in hand and already halfway through the crossword.",
        personId: "frank",
      },
      {
        id: "ruby-lunch",
        time: "12:30",
        headline: "Ruby is coming for lunch",
        description:
          "She always arrives with the sketchbook and a question about the old albums.",
        personId: "ruby",
      },
      {
        id: "david-call",
        time: "19:00",
        headline: "Telephone call with David",
        description:
          "His weekly call about circuits — and exactly which biscuit goes with tea.",
        personId: "david",
      },
    ],

    upcomingEvents: [
      {
        id: "ellen-call",
        day: "Tomorrow",
        title: "Ellen's telephone call",
        personId: "ellen",
      },
      {
        id: "chess-night",
        day: "Wednesday",
        title: "Chess night at the community hall",
        personId: "jamal",
      },
      {
        id: "river-walk",
        day: "Saturday",
        title: "The river walk with Tom",
        personId: "tom",
      },
    ],

    /** Photos the user has captured with the camera. */
    memories: [],

    /**
     * The user's edits to today's schedule, plus the log of what changed and
     * who changed it ("companion" or "person") for family to review.
     */
    schedule: { events: {}, removedIds: [], changes: [] },
  };
}
