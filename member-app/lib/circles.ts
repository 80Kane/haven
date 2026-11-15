// Original editorial content; no member stories or third-party course materials.
export const circles = [
  {
    slug: "recovery-healing",
    title: "Recovery & Healing",
    kind: "leaf",
    tone: "sage",
    description:
      "Different recovery journeys. Shared experience, without pressure.",
    lead: "Different journeys. Room for yours.",
    introduction:
      "A space being prepared for shared experience, encouragement, and recovery in its many forms. You choose what to share, and listening can be participation too.",
    reflectionTitle: "One small step is still a step.",
    prompt:
      "What does moving forward at your own pace look like for you this week?",
    considerations: [
      "Notice something that has helped you through a hard moment.",
      "Consider what support you would welcome today.",
      "Choose a next step that feels manageable to you.",
    ],
  },
  {
    slug: "choices-change",
    title: "Choices & Change",
    kind: "path",
    tone: "amber",
    description:
      "Reflect on decisions, new directions, and what matters to you.",
    lead: "A pause can make room for a choice.",
    introduction:
      "A space to reflect on decisions and patterns without reducing yourself to a past mistake. Change can include trying something different, asking for support, or starting again.",
    reflectionTitle: "Make room for your next choice.",
    prompt:
      "What is one situation where you would like a little more space between your first reaction and your response?",
    considerations: [
      "Name what matters to you in that situation.",
      "Think of one option you have not tried yet.",
      "Consider who could help you think it through.",
    ],
  },
  {
    slug: "mental-wellness",
    title: "Mental Wellness",
    kind: "sun",
    tone: "sky",
    description: "Make room for everyday well-being and difficult days.",
    lead: "You can arrive as you are.",
    introduction:
      "A space for sharing everyday experiences of well-being, stress, and support. There is no expectation to explain a diagnosis or turn a difficult day into a positive story.",
    reflectionTitle: "Notice what this day is asking of you.",
    prompt: "What would feeling supported look like for you today?",
    considerations: [
      "Notice what feels demanding right now.",
      "Think about a boundary or small comfort you might welcome.",
      "You can leave this prompt and come back another day.",
    ],
  },
  {
    slug: "veterans-connection",
    title: "Veterans Connection",
    kind: "star",
    tone: "navy",
    description:
      "Connection through service, transitions, and life beyond the uniform.",
    lead: "Your story extends beyond your service.",
    introduction:
      "A space being prepared for veterans to connect through shared experience and different paths after service. You decide whether service experiences are part of what you share.",
    reflectionTitle: "There is room for who you are now.",
    prompt:
      "What is something you want people to understand about the person you are today?",
    considerations: [
      "Consider a part of your life that matters beyond a job or uniform.",
      "Think of a connection you would like to strengthen.",
      "Keep any service details you prefer private to yourself.",
    ],
  },
  {
    slug: "family-relationships",
    title: "Family & Relationships",
    kind: "heart",
    tone: "rose",
    description: "Explore boundaries, caregiving, and the people who matter.",
    lead: "Connection can include boundaries.",
    introduction:
      "A space to reflect on family, chosen family, caregiving, and relationships. Different family structures and personal boundaries belong here. Share your own experience while protecting other people’s privacy.",
    reflectionTitle: "Care for yourself within connection.",
    prompt:
      "What is one boundary or kind of support that could make a relationship feel more manageable?",
    considerations: [
      "Consider what is within your control.",
      "Think about a need you would like to name clearly.",
      "You do not need to identify another person to reflect.",
    ],
  },
  {
    slug: "reentry-new-beginnings",
    title: "Reentry & New Beginnings",
    kind: "door",
    tone: "terra",
    description: "Find your footing while reconnecting with community.",
    lead: "A new beginning can happen one step at a time.",
    introduction:
      "A space for the practical and personal sides of returning to community. You choose what to share about your past; housing, work, relationships, and everyday routines can all be part of finding your footing.",
    reflectionTitle: "Start with what matters most today.",
    prompt:
      "What is one practical need or connection that would make this week a little easier?",
    considerations: [
      "Choose a priority that matters to you, even if other needs remain.",
      "Think about information you would want before contacting a resource.",
      "Leave identifying case, court, or supervision details out of shared spaces.",
    ],
  },
  {
    slug: "purpose-personal-growth",
    title: "Purpose & Personal Growth",
    kind: "compass",
    tone: "plum",
    description:
      "Learning, creativity, and your own definition of moving forward.",
    lead: "Growth can follow your own direction.",
    introduction:
      "A space for learning, creativity, values, and discovering what gives life meaning. Your direction can include faith, family, community, work, or something you are still exploring. No single path is expected.",
    reflectionTitle: "Make room for what matters to you.",
    prompt:
      "What is something you would like to make more room for in your life?",
    considerations: [
      "Consider a value, interest, or connection you want to honor.",
      "Imagine a small way to explore it without taking on too much.",
      "You can change direction as you learn more about yourself.",
    ],
  },
] as const;

export function findCircle(slug: string) {
  return circles.find((circle) => circle.slug === slug);
}
