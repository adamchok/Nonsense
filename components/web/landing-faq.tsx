import { Icon } from '@/components/icon';
import { Animated } from '@/components/motion';
import { type AppColors } from '@/lib/app-theme';
import { radius, space } from '@/lib/spacing';
import { text } from '@/lib/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FadeIn, ReduceMotion } from 'react-native-reanimated';

type Faq = { q: string; a: string };

const FAQS: Faq[] = [
  {
    q: 'Is it really free?',
    a: 'Yes. Nonsense is free to use, with no ads.',
  },
  {
    q: 'Does Nonsense handle any money?',
    a: 'No. It only records amounts. Paying each other happens outside the app, however your table likes to do it.',
  },
  {
    q: 'How does settle-up work?',
    a: 'Enter everyone’s final stack. Nonsense works out each player’s result and the smallest number of payments that squares the table.',
  },
  {
    q: 'We play with chips, not cash. Does that work?',
    a: 'Yes. Start a chip session, set what one chip is worth, and results convert to money at the end.',
  },
  {
    q: 'Who can see my results?',
    a: 'Only the people you play with: players in the same session, your friends and your group members. Read the Privacy Policy for the details.',
  },
  {
    q: 'What do I need to use it?',
    a: 'A modern browser on your phone or computer, and a Google account or an email address to sign in.',
  },
];

function liftLight(c: AppColors): object {
  const ink = c.text.replace('#', '');
  const n = parseInt(ink, 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  return { boxShadow: `0 1px 2px rgba(${rgb},0.05), 0 12px 28px -16px rgba(${rgb},0.16)` };
}

const chevronMotion = { transition: 'transform 220ms cubic-bezier(0.23, 1, 0.32, 1)' } as object;

function FaqItem({
  item,
  index,
  isOpen,
  isFirst,
  c,
  rule,
  onToggle,
}: {
  item: Faq;
  index: number;
  isOpen: boolean;
  isFirst: boolean;
  c: AppColors;
  rule: string;
  onToggle: (i: number) => void;
}) {
  const answerId = `faq-answer-${index}`;
  const questionId = `faq-question-${index}`;

  return (
    <View style={[!isFirst && styles.divider, { borderTopColor: rule }]}>
      <View role="heading" aria-level={3}>
        <Pressable
          role="button"
          nativeID={questionId}
          aria-expanded={isOpen}
          aria-controls={answerId}
          onPress={() => onToggle(index)}
          {...({ dataSet: { hoverWarm: 'true' } } as object)}
          style={styles.question}>
          <Text style={[styles.qText, { color: c.text }]}>{item.q}</Text>
          <View style={[{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }, chevronMotion]}>
            <Icon
              name="expand-more"
              size={22}
              color={isOpen ? c.accentText : c.textMuted}
              importantForAccessibility="no"
            />
          </View>
        </Pressable>
      </View>
      {isOpen && (
        <Animated.View
          entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}
          nativeID={answerId}
          role="region"
          aria-labelledby={questionId}
          style={styles.answer}>
          <Text style={[text.body, styles.answerText, { color: c.textMuted }]}>{item.a}</Text>
        </Animated.View>
      )}
    </View>
  );
}

export function LandingFaq({ c, dark, rule }: { c: AppColors; isWide: boolean; dark: boolean; rule: string }) {
  // All collapsed until the reader picks a question.
  const [open, setOpen] = useState<number | null>(null);
  const toggle = (i: number) => setOpen((current) => (current === i ? null : i));

  return (
    // One solid card, like the other content cards, so the falling cards never run behind the questions.
    <View style={[styles.list, { backgroundColor: c.card, borderColor: rule }, !dark && liftLight(c)]}>
      {FAQS.map((item, i) => (
        <FaqItem
          key={item.q}
          item={item}
          index={i}
          isOpen={open === i}
          isFirst={i === 0}
          c={c}
          rule={rule}
          onToggle={toggle}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  question: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    minHeight: 64,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
  },
  qText: { flex: 1, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  answer: { paddingHorizontal: space.xl, paddingTop: 0, paddingBottom: space.xl },
  answerText: { maxWidth: 680 },
});
