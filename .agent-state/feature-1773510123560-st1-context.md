# СИСТЕМНЫЙ КОНТЕКСТ
Ты — Coder агент GrandHub. Твоя задача: реализовать код строго по TaskSpec.
Работай только в пределах file_scope. Запускай eval-loop.sh после каждого изменения.
\n# TASK SPEC\n{
  "task_id": "feature-1773510123560-st1",
  "title": "feat(telegram-bot): команда /recommend — рекомендации фильмов и книг",
  "description": "GitHub Issue #35: feat(telegram-bot): команда /recommend — рекомендации фильмов и книг\n\nДобавить команду /recommend в telegram-bot.\n\nФункционал:\n- Команда /recommend запускает скилл media-recommender\n- Бот спрашивает: «Что хочешь? Фильм / Книга / Музыка / Сериал» (inline кнопки)\n- После выбора — даёт 1-2 рекомендации с кнопками: «Буду смотреть 👍», «Не моё 👎», «Ещё вариант 🔄»\n- Если нажали «Буду смотреть» — сохранить в user_preferences (таблица или JSON в users)\n\nФайлы:\n- services/telegram-bot/src/commands/recommend.ts — новый файл\n- services/telegram-bot/src/bot.ts — зарегистрир",
  "service": "telegram-bot",
  "type": "feature",
  "file_scope": [],
  "allow_test_failure": true,
  "created_at": "2026-03-14T17:42:03.601Z"
}\n\n# AGENT.md — telegram-bot\n⚠️ AGENT.md отсутствует. Изучи код самостоятельно.\n\n# ФАЙЛ: eslint.config.js\n```typescript\n// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', '.turbo/', '**/*.js', '!eslint.config.js'],
  },

  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript recommended (without type-checked for legacy code)
  ...tseslint.configs.recommended,

  // Prettier — disable formatting rules that conflict
  prettierConfig,

  // Main config for all TypeScript files
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Disable strict type-checked rules for legacy telegram-bot code
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'warn',
      // Relax promise rules for grammy + express handlers (they handle async internally)
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-console': 'off', // Allow console in bot service
      'no-case-declarations': 'off', // Legacy switch/case patterns
      'no-useless-escape': 'warn', // Legacy string patterns
    },
  },
);\n```\n\n# ФАЙЛ: src/bot.ts\n```typescript\n/**
 * Создание и настройка Grammy-бота.
 * Регистрация команд, middleware (auth, rate-limit), обработчиков сообщений и callback.
 */

import { Bot } from 'grammy';
import { BotContext } from './middleware/auth';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { startCommand } from './commands/start';
import { helpCommand } from './commands/help';
import { skillsCommand } from './commands/skills';
import { newSkillsCommand } from './commands/new-skills';
import { planCommand } from './commands/plan';
import { settingsCommand } from './commands/settings';
import { assistantsCommand } from './commands/assistants';
import { statsCommand } from './commands/stats';
import {
  handleMyId,
  handleConnect,
  handleContacts,
  handleSend,
  handleA2ASettings,
} from './commands/a2a';
import { connectCalendarCommand, calendarStatusCommand } from './commands/calendar';
import { expensesCommand } from './commands/expenses';
import {
  handleSubscriptionsCommand,
  handleAddSubscriptionCommand,
  handleSubscriptionStatsCommand,
} from './handlers/subscriptions';
import {
  handleMoodCommand,
  handleMoodStatsCommand,
  handleMoodHistoryCommand,
} from './handlers/mood';
import { handleMessage } from './handlers/message';
import { perksCommand, achievementsCommand, leaderboardCommand } from './commands/perks';
import { handleCallback } from './handlers/callback';
import {
  habitsCommand,
  addHabitCommand,
  habitDoneCommand,
  habitStatsCommand,
} from './commands/habits';
import { projectCommand } from './commands/project';
import { workflowCommand } from './commands/workflow';
import { config } from './config';

export function createBot() {
  const bot = new Bot<BotContext>(config.telegram.botToken);

  // Set bot commands menu
  bot.api
    .setMyCommands([
      { command: 'start', description: '🚀 Начать работу' },
      { command: 'help', description: '❓ Помощь' },
      { command: 'skills', description: '🎯 Мои навыки' },
      { command: 'new', description: '🆕 Новые скиллы' },
      { command: 'plan', description: '💎 Тарифный план' },
      { command: 'settings', description: '⚙️ Настройки' },
      { command: 'stats', description: '📊 Моя статистика' },
      { command: 'myid', description: '🆔 Мой ID для A2A' },
      { command: 'contacts', description: '👥 Контакты A2A' },
      { command: 's', description: '✉️ Быстрая отправка' },
      { command: 'sites', description: '🌐 Мои сайты' },
      { command: 'expenses', description: '📊 Мои траты' },
      { command: 'subscriptions', description: '💳 Подписки' },
      { command: 'add_subscription', description: '➕ Добавить подписку' },
      { command: 'subscription_stats', description: '📊 Статистика подписок' },
      { command: 'habits', description: '🎯 Мои привычки' },
      { command: 'add_habit', description: '➕ Добавить привычку' },
      { command: 'habit_done', description: '✅ Отметить привычку' },
      { command: 'habit_stats', description: '📊 Статистика привычек' },
      { command: 'mood', description: '😊 Записать настроение' },
      { command: 'mood_stats', description: '📊 Статистика настроения' },
      { command: 'mood_history', description: '📋 История настроения' },
      { command: 'perks', description: '🎮 Мои перки' },
      { command: 'achievements', description: '🏅 Достижения' },
      { command: 'leaderboard', description: '🏆 Топ игроков' },
      { command: 'project', description: '📂 Мои проекты' },
      { command: 'workflow', description: '⚡ Workflows' },
    ])
    .catch((err) => console.error('Failed to set commands:', err));

  // Middleware
  bot.use(rateLimitMiddleware);
  bot.use(authMiddleware);

  // Commands
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('skills', skillsCommand);
  bot.command('new', newSkillsCommand);
  bot.command('plan', planCommand);
  bot.command('settings', settingsCommand);
  bot.command('assistants', assistantsCommand);
  bot.command('stats', statsCommand);

  // A2A Commands
  bot.command('myid', handleMyId);
  bot.command('connect', handleConnect);
  bot.command('contacts', handleContacts);
  bot.command('send', handleSend);
  bot.command('s', handleSend); // Алиас для быстрой отправки
  bot.command('a2a_settings', handleA2ASettings);
  bot.command('connect_calendar', connectCalendarCommand);
  bot.command('calendar', calendarStatusCommand);
  bot.command('expenses', expensesCommand);
  bot.command('траты', expensesCommand);
  bot.command('subscriptions', handleSubscriptionsCommand);
  bot.command('add_subscription', handleAddSubscriptionCommand);
  bot.command('subscription_stats', handleSubscriptionStatsCommand);

  // Habits Commands
  bot.command('habits', habitsCommand);
  bot.command('add_habit', addHabitCommand);
  bot.command('habit_done', habitDoneCommand);
  bot.command('habit_stats', habitStatsCommand);

  // Mood Commands
  bot.command('mood', handleMoodCommand);
  bot.command('mood_stats', handleMoodStatsCommand);
  bot.command('mood_history', handleMoodHistoryCommand);

  // Projects & Workflows
  bot.command('project', projectCommand);
  bot.command('workflow', workflowCommand);

  // Perks & Achievements
  bot.command('perks', perksCommand);
  bot.command('achievements', achievementsCommand);
  bot.command('leaderboard', leaderboardCommand);

  // Callback queries (inline buttons)
  bot.on('callback_query:data', handleCallback);

  // Message handlers
  bot.on('message', handleMessage);

  // Error handling
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);

    ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.').catch((e) => {
      console.error('Failed to send error message to user:', e);
    });
  });

  return bot;
}\n```\n\n# ФАЙЛ: src/index.ts\n```typescript\n/**
 * Точка входа Telegram-бота.
 * Запуск бота (polling/webhook), Express-сервер для internal API, cron-задачи.
 */

import { createBot } from './bot';
import { config, isDev } from './config';
import { nudgeService } from './services/nudge';
import type { Request, Response } from 'express';
import express from 'express';
import subscriptionRoutes from './routes/subscriptions';
import moodRoutes from './routes/moods';
import { initCronJobs } from './services/cron-service';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'grandhub-internal-dev';

async function main() {
  console.log('🤖 Starting GrandBazar Telegram Bot...');
  console.log(`Environment: ${config.server.nodeEnv}`);
  console.log(`Port: ${config.server.port}`);

  const bot = createBot();
  
  // Инициализируем nudge service с ботом
  nudgeService.setBot(bot);
  
  // Инициализируем cron jobs
  initCronJobs();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Получаем информацию о боте
  const botInfo = await bot.api.getMe();
  console.log(`✅ Bot started: @${botInfo.username}`);

  // ════════════════════════════════════════════
  // Internal API для проактивных уведомлений
  // ════════════════════════════════════════════
  const internalApp = express();
  internalApp.use(express.json());
  
  // Subscription API routes
  internalApp.use('/api/subscriptions', subscriptionRoutes);
  internalApp.use('/api/moods', moodRoutes);
  
  // Auth middleware
  internalApp.use((req, res, next) => {
    const key = req.headers['x-internal-key'];
    if (key !== INTERNAL_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });
  
  // Send proactive message
  internalApp.post('/api/internal/send', async (req: Request, res: Response) => {
    try {
      const { telegramId, message, parseMode = 'Markdown' } = req.body;
      
      if (!telegramId || !message) {
        return res.status(400).json({ error: 'Missing telegramId or message' });
      }
      
      await bot.api.sendMessage(telegramId, message, { 
        parse_mode: parseMode as 'Markdown' | 'HTML'
      });
      
      console.log(`📤 Proactive message sent to ${telegramId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to send proactive message:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Health check
  internalApp.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', bot: botInfo.username, mode: 'internal-api' });
  });
  
  const internalPort = Number(config.server.port) || 4004;
  internalApp.listen(internalPort, () => {
    console.log(`🔌 Internal API running on port ${internalPort}`);
  });

  // ════════════════════════════════════════════
  // Запуск бота
  // ════════════════════════════════════════════
  if (isDev || !config.telegram.webhookUrl) {
    // Development: Long Polling
    console.log('🔄 Running in Long Polling mode');
    await bot.start({
      onStart: (botInfo) => {
        console.log(`🚀 Bot @${botInfo.username} is running!`);
      }
    });
  } else {
    // Production: Webhook
    console.log(`🔗 Setting up webhook: ${config.telegram.webhookUrl}`);
    
    await bot.api.setWebhook(config.telegram.webhookUrl);
    
    const webhookApp = express();
    webhookApp.use(express.json());
    
    webhookApp.post('/webhook', async (req: Request, res: Response) => {
      try {
        await bot.handleUpdate(req.body);
        res.sendStatus(200);
      } catch (error) {
        console.error('Webhook error:', error);
        res.sendStatus(500);
      }
    });

    const webhookPort = Number(config.server.port) + 1;
    webhookApp.listen(webhookPort, () => {
      console.log(`🚀 Webhook server running on port ${webhookPort}`);
    });
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});\n```\n\n# ФАЙЛ: src/handlers/site-builder.ts\n```typescript\n/**
 * Диалоговый конструктор сайта-визитки.
 * Пошаговый ввод: название → описание → контакты → подтверждение.
 */

import { BotContext } from '../middleware/auth';
import { InlineKeyboard } from 'grammy';
import axios from 'axios';

const SITES_API_URL = process.env.SITES_API_URL || 'http://localhost:4035/api/v1/sites';

interface SiteBuilderState {
  stage: 'name' | 'description' | 'contacts' | 'confirm';
  data: {
    name?: string;
    description?: string;
    contacts?: string;
  };
}

// In-memory state
const siteBuilderStates = new Map<number, SiteBuilderState>();

// Триггеры для начала создания сайта
const siteTriggers = [
  'создай сайт',
  'сделай сайт',
  'хочу сайт',
  'нужен сайт',
  'создать сайт',
  'сделать визитку',
  'создай визитку',
  'хочу визитку',
  'мой сайт',
  'личный сайт',
  'лендинг',
  'создай лендинг'
];

export function isSiteTrigger(text: string): boolean {
  const lowerText = text.toLowerCase();
  return siteTriggers.some(trigger => lowerText.includes(trigger));
}

export function isInSiteBuilder(userId: number): boolean {
  return siteBuilderStates.has(userId);
}

export async function handleSiteBuilder(ctx: BotContext) {
  if (!ctx.from || !ctx.message?.text) return;

  const userId = ctx.from.id;
  const messageText = ctx.message.text;

  // Если пользователь в процессе создания сайта
  if (siteBuilderStates.has(userId)) {
    await handleSiteBuilderStep(ctx, userId, messageText);
    return;
  }

  // Начало создания сайта
  await startSiteBuilder(ctx);
}

async function startSiteBuilder(ctx: BotContext) {
  if (!ctx.from) return;
  
  const userId = ctx.from.id;
  
  await ctx.reply(
    '🎨 *Создание сайта-визитки*\n\n' +
    'Отлично! Я помогу вам создать красивый сайт.\n\n' +
    'Для начала, как вас зовут? (или название вашего бренда)',
    { parse_mode: 'Markdown' }
  );

  siteBuilderStates.set(userId, {
    stage: 'name',
    data: {}
  });
}

async function handleSiteBuilderStep(ctx: BotContext, userId: number, messageText: string) {
  const state = siteBuilderStates.get(userId);
  if (!state || !ctx.user) return;

  switch (state.stage) {
    case 'name':
      if (messageText.length < 2) {
        await ctx.reply('Имя должно быть длиннее. Попробуйте ещё раз:');
        return;
      }
      
      state.data.name = messageText;
      state.stage = 'description';
      
      await ctx.reply(
        'Отлично! 👌\n\n' +
        'Теперь расскажите немного о себе или своей деятельности.\n' +
        'Чем вы занимаетесь? В чём ваша специализация?'
      );
      break;

    case 'description':
      if (messageText.length < 10) {
        await ctx.reply('Описание слишком короткое. Расскажите подробнее (минимум 10 символов):');
        return;
      }
      
      state.data.description = messageText;
      state.stage = 'contacts';
      
      await ctx.reply(
        'Прекрасно! 🎯\n\n' +
        'Последний шаг — укажите ваши контакты для связи.\n' +
        'Например: email, телефон, Telegram, Instagram и т.д.\n\n' +
        'Формат: свободный, через запятую или с новой строки.'
      );
      break;

    case 'contacts':
      if (messageText.length < 5) {
        await ctx.reply('Укажите хотя бы один контакт:');
        return;
      }
      
      state.data.contacts = messageText;
      state.stage = 'confirm';
      
      // Показываем превью
      const preview = 
        '📋 *Проверьте данные:*\n\n' +
        `👤 *Имя:* ${state.data.name}\n` +
        `📝 *О себе:* ${state.data.description}\n` +
        `📞 *Контакты:* ${state.data.contacts}\n\n` +
        'Всё верно?';
      
      const keyboard = new InlineKeyboard()
        .text('✅ Да, создать сайт', 'site_confirm')
        .text('❌ Отменить', 'site_cancel');
      
      await ctx.reply(preview, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard 
      });
      break;
  }
}

export async function handleSiteBuilderCallback(ctx: BotContext, action: string) {
  if (!ctx.from || !ctx.user) return;
  
  const userId = ctx.from.id;
  const state = siteBuilderStates.get(userId);

  if (action === 'site_confirm' && state) {
    await ctx.answerCallbackQuery();
    await ctx.reply('⏳ Создаю ваш сайт...');

    try {
      // Формируем описание для AI генератора
      const aiDescription = 
        `Визитка для ${state.data.name}.\n\n` +
        `О себе: ${state.data.description}\n\n` +
        `Контакты: ${state.data.contacts}\n\n` +
        `Стиль: современный, минималистичный, профессиональный. ` +
        `Должен быть responsive. Используй современный дизайн с градиентами и плавными переходами.`;

      // Создаём сайт через API
      const response = await axios.post(SITES_API_URL, {
        userId: ctx.user.id,
        name: state.data.name || 'Моя визитка',
        description: aiDescription,
        generateFromDescription: true
      });

      const site = response.data;
      
      // Очищаем состояние
      siteBuilderStates.delete(userId);

      await ctx.reply(
        '🎉 *Ваш сайт готов!*\n\n' +
        `🔗 ${site.url}\n\n` +
        'Можете сразу отправить эту ссылку друзьям или добавить в соцсети!',
        { parse_mode: 'Markdown' }
      );

      // Дополнительные действия
      const actionsKeyboard = new InlineKeyboard()
        .text('📱 Посмотреть мои сайты', 'sites_list')
        .row()
        .text('🎨 Создать ещё один', 'sites_create');

      await ctx.reply('Что дальше?', { reply_markup: actionsKeyboard });

    } catch (error: any) {
      console.error('Error creating site:', error);
      await ctx.reply(
        '❌ Не удалось создать сайт. Попробуйте позже или обратитесь в поддержку.'
      );
      siteBuilderStates.delete(userId);
    }

  } else if (action === 'site_cancel') {
    await ctx.answerCallbackQuery();
    siteBuilderStates.delete(userId);
    await ctx.reply('❌ Создание сайта отменено.');
  } else if (action === 'sites_list') {
    await ctx.answerCallbackQuery();
    await showUserSites(ctx);
  } else if (action === 'sites_create') {
    await ctx.answerCallbackQuery();
    siteBuilderStates.delete(userId);
    await startSiteBuilder(ctx);
  }
}

async function showUserSites(ctx: BotContext) {
  if (!ctx.user) return;

  try {
    const response = await axios.get(`${SITES_API_URL}/${ctx.user.id}`);
    const sites = response.data.sites;

    if (sites.length === 0) {
      await ctx.reply('У вас пока нет сайтов. Создайте первый!');
      return;
    }

    let message = '🌐 *Ваши сайты:*\n\n';
    sites.forEach((site: any, index: number) => {
      message += `${index + 1}. **${site.name}**\n`;
      message += `   🔗 ${site.url}\n`;
      message += `   👁 Просмотров: ${site.views}\n`;
      message += `   📅 Создан: ${new Date(site.createdAt).toLocaleDateString('ru-RU')}\n\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error fetching user sites:', error);
    await ctx.reply('❌ Не удалось загрузить список сайтов.');
  }
}

export { siteBuilderStates };\n```\n\n# ФАЙЛ: src/handlers/subscriptions.ts\n```typescript\n/**
 * Обработчик подписок пользователя (трекинг внешних сервисов).
 * Добавление, список, статистика, напоминания о продлении.
 */

import { BotContext } from '../middleware/auth';
import { InlineKeyboard } from 'grammy';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

interface SubscriptionData {
  name: string;
  amount: number;
  currency: string;
  billingCycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  nextBillingDate?: Date;
  category?: string;
}

// In-memory state для добавления подписки
const addSubscriptionStates = new Map<number, Partial<SubscriptionData>>();

// AI парсинг текста подписки
async function parseSubscriptionText(text: string): Promise<SubscriptionData | null> {
  const lowerText = text.toLowerCase();
  
  // Паттерны для извлечения данных
  const priceMatch = lowerText.match(/(\d+(?:[.,]\d+)?)\s*(?:₽|руб|rub|р)/i);
  const monthlyKeywords = ['месяц', 'ежемесяч', 'в месяц', 'monthly', 'per month'];
  const yearlyKeywords = ['год', 'ежегодн', 'в год', 'yearly', 'per year'];
  const weeklyKeywords = ['недел', 'еженедельн', 'в неделю', 'weekly', 'per week'];
  
  if (!priceMatch) return null;
  
  const amount = parseFloat(priceMatch[1].replace(',', '.'));
  
  // Определяем цикл оплаты
  let billingCycle: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' = 'MONTHLY';
  if (monthlyKeywords.some(kw => lowerText.includes(kw))) {
    billingCycle = 'MONTHLY';
  } else if (yearlyKeywords.some(kw => lowerText.includes(kw))) {
    billingCycle = 'YEARLY';
  } else if (weeklyKeywords.some(kw => lowerText.includes(kw))) {
    billingCycle = 'WEEKLY';
  }
  
  // Извлекаем название (убираем цену и служебные слова)
  let name = text
    .replace(/\d+(?:[.,]\d+)?\s*(?:₽|руб|rub|р)/gi, '')
    .replace(/(?:месяц|ежемесяч|в месяц|год|ежегодн|в год|недел|еженедельн|в неделю)/gi, '')
    .replace(/(?:подписк|добав|трек)/gi, '')
    .trim();
  
  // Если название пустое, берём первое слово
  if (!name) {
    const words = text.split(/\s+/);
    name = words[0] || 'Подписка';
  }
  
  // Определяем категорию по названию
  const category = detectCategory(name);
  
  // Вычисляем следующую дату списания
  const nextBillingDate = new Date();
  switch (billingCycle) {
    case 'WEEKLY':
      nextBillingDate.setDate(nextBillingDate.getDate() + 7);
      break;
    case 'MONTHLY':
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
      break;
    case 'YEARLY':
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      break;
  }
  
  return {
    name,
    amount,
    currency: 'RUB',
    billingCycle,
    nextBillingDate,
    category
  };
}

function detectCategory(name: string): string {
  const lowerName = name.toLowerCase();
  
  const categories: Record<string, string[]> = {
    ENTERTAINMENT: ['netflix', 'spotify', 'youtube', 'ivi', 'кинопоиск', 'okko', 'megogo', 'premier', 'music', 'sound'],
    SOFTWARE: ['office', 'adobe', 'notion', 'figma', 'github', 'chatgpt', 'claude', 'midjourney'],
    EDUCATION: ['coursera', 'udemy', 'skillbox', 'нетология', 'яндекс практикум', 'stepik'],
    HEALTH: ['фитнес', 'fitness', 'health', 'здоровье', 'спорт'],
    FINANCE: ['банк', 'bank', 'страхов', 'insurance', 'инвестиц'],
    SHOPPING: ['delivery', 'доставк', 'магазин', 'market'],
    UTILITIES: ['интернет', 'internet', 'mobile', 'мобильн', 'связь', 'телефон', 'хостинг', 'hosting'],
    TRANSPORT: ['taxi', 'такси', 'каршеринг', 'carsharing', 'яндекс.go', 'uber']
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => lowerName.includes(kw))) {
      return category;
    }
  }
  
  return 'OTHER';
}

// Команда /subscriptions
export async function handleSubscriptionsCommand(ctx: BotContext) {
  if (!ctx.from || !ctx.user) return;
  
  try {
    const response = await axios.get(`${API_URL}/subscriptions`, {
      headers: { 'Authorization': `Bearer ${ctx.user.id}` }
    });
    
    const subscriptions = response.data;
    
    if (!subscriptions || subscriptions.length === 0) {
      await ctx.reply(
        '📋 У вас пока нет подписок.\n\n' +
        'Используйте /add_subscription чтобы добавить первую подписку, ' +
        'или просто напишите:\n' +
        '💬 "добавь подписку Netflix 799р в месяц"'
      );
      return;
    }
    
    // Группируем по статусу
    const active = subscriptions.filter((s: any) => s.status === 'ACTIVE');
    const paused = subscriptions.filter((s: any) => s.status === 'PAUSED');
    const cancelled = subscriptions.filter((s: any) => s.status === 'CANCELLED');
    
    let message = '📋 *Ваши подписки:*\n\n';
    
    if (active.length > 0) {
      message += '*✅ Активные:*\n';
      for (const sub of active) {
        const nextDate = new Date(sub.nextBillingDate).toLocaleDateString('ru');
        const cycle = sub.billingCycle === 'MONTHLY' ? 'мес' : 
                      sub.billingCycle === 'YEARLY' ? 'год' :
                      sub.billingCycle === 'WEEKLY' ? 'нед' : 'кв';
        message += `• ${sub.name}: ${sub.amount} ${sub.currency}/${cycle} (следующее списание: ${nextDate})\n`;
      }
      message += '\n';
    }
    
    if (paused.length > 0) {
      message += '*⏸ Приостановлены:*\n';
      for (const sub of paused) {
        message += `• ${sub.name}: ${sub.amount} ${sub.currency}\n`;
      }
      message += '\n';
    }
    
    if (cancelled.length > 0) {
      message += '*❌ Отменены:*\n';
      for (const sub of cancelled) {
        message += `• ${sub.name}\n`;
      }
      message += '\n';
    }
    
    const keyboard = new InlineKeyboard()
      .text('📊 Статистика', 'sub_stats')
      .text('➕ Добавить', 'sub_add')
      .row()
      .text('⚙️ Управление', 'sub_manage');
    
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    await ctx.reply('⚠️ Ошибка при загрузке подписок. Попробуйте позже.');
  }
}

// Команда /add_subscription
export async function handleAddSubscriptionCommand(ctx: BotContext) {
  if (!ctx.from) return;
  
  await ctx.reply(
    '➕ *Добавление подписки*\n\n' +
    'Вы можете:\n' +
    '1️⃣ Написать вручную: "Netflix 799р в месяц"\n' +
    '2️⃣ Ответить на вопросы\n\n' +
    '💡 Я понимаю естественный язык!',
    { parse_mode: 'Markdown' }
  );
  
  addSubscriptionStates.set(ctx.from.id, {});
}

// AI парсинг из сообщения
export async function handleSubscriptionMessage(ctx: BotContext) {
  if (!ctx.from || !ctx.message?.text || !ctx.user) return;
  
  const text = ctx.message.text;
  
  // Триггеры для добавления подписки
  const triggers = ['добав', 'подписк', 'трек', 'subscription'];
  if (!triggers.some(t => text.toLowerCase().includes(t))) {
    return;
  }
  
  await ctx.reply('🔍 Анализирую...');
  
  const parsed = await parseSubscriptionText(text);
  
  if (!parsed) {
    await ctx.reply(
      '⚠️ Не удалось распознать подписку.\n\n' +
      'Попробуйте формат: "Название цена цикл"\n' +
      'Например: "Netflix 799р в месяц"'
    );
    return;
  }
  
  const keyboard = new InlineKeyboard()
    .text('✅ Да, добавить', `sub_confirm`)
    .text('✏️ Изменить', 'sub_edit')
    .row()
    .text('❌ Отменить', 'sub_cancel');
  
  // Сохраняем parsed data в state
  addSubscriptionStates.set(ctx.from.id, parsed);
  
  const cycleText = {
    MONTHLY: 'в месяц',
    YEARLY: 'в год',
    WEEKLY: 'в неделю',
    QUARTERLY: 'в квартал'
  }[parsed.billingCycle];
  
  await ctx.reply(
    `📝 Распознано:\n\n` +
    `💳 ${parsed.name}\n` +
    `💰 ${parsed.amount} ${parsed.currency} ${cycleText}\n` +
    `📅 Следующее списание: ${parsed.nextBillingDate?.toLocaleDateString('ru')}\n` +
    `🏷 Категория: ${parsed.category}\n\n` +
    `Всё верно?`,
    { reply_markup: keyboard }
  );
}

// Команда /subscription_stats
export async function handleSubscriptionStatsCommand(ctx: BotContext) {
  if (!ctx.from || !ctx.user) return;
  
  try {
    const response = await axios.get(`${API_URL}/subscriptions/stats`, {
      headers: { 'Authorization': `Bearer ${ctx.user.id}` }
    });
    
    const stats = response.data;
    
    let message = '📊 *Статистика подписок:*\n\n';
    message += `💳 Всего подписок: ${stats.total}\n`;
    message += `✅ Активных: ${stats.active}\n\n`;
    
    message += `*Расходы:*\n`;
    message += `• В месяц: ${stats.monthlyTotal} RUB\n`;
    message += `• В год: ${stats.yearlyTotal} RUB\n\n`;
    
    if (stats.byCategory && Object.keys(stats.byCategory).length > 0) {
      message += `*По категориям:*\n`;
      const sorted = Object.entries(stats.byCategory as Record<string, number>)
        .sort(([,a], [,b]) => (b as number) - (a as number));
      
      for (const [category, amount] of sorted) {
        message += `• ${category}: ${amount} RUB/мес\n`;
      }
      message += '\n';
    }
    
    if (stats.upcoming && stats.upcoming.length > 0) {
      message += `*Ближайшие списания:*\n`;
      for (const sub of stats.upcoming) {
        const date = new Date(sub.nextBillingDate).toLocaleDateString('ru');
        message += `• ${sub.name}: ${sub.amount} RUB (${date})\n`;
      }
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    await ctx.reply('⚠️ Ошибка при загрузке статистики.');
  }
}

// Обработка callback кнопок
export async function handleSubscriptionCallbacks(ctx: BotContext) {
  if (!ctx.callbackQuery?.data || !ctx.from || !ctx.user) return;
  
  const data = ctx.callbackQuery.data;
  
  if (data === 'sub_stats') {
    await handleSubscriptionStatsCommand(ctx);
    await ctx.answerCallbackQuery();
  } else if (data === 'sub_add') {
    await handleAddSubscriptionCommand(ctx);
    await ctx.answerCallbackQuery();
  } else if (data === 'sub_cancel') {
    addSubscriptionStates.delete(ctx.from.id);
    await ctx.answerCallbackQuery('Отменено');
    await ctx.reply('❌ Добавление подписки отменено');
  } else if (data === 'sub_confirm') {
    // Создаём подписку
    try {
      const parsed = addSubscriptionStates.get(ctx.from.id);
      if (!parsed) {
        await ctx.answerCallbackQuery('⚠️ Данные не найдены');
        return;
      }
      
      await axios.post(
        `${API_URL}/subscriptions`,
        parsed,
        {
          headers: { 
            'Authorization': `Bearer ${ctx.user.id}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      await ctx.answerCallbackQuery('✅ Подписка добавлена!');
      await ctx.reply(
        '✅ Подписка успешно добавлена!\n\n' +
        'Я напомню вам за 3 дня до списания. 📅\n\n' +
        'Используйте /subscriptions чтобы посмотреть все подписки.'
      );
      
      addSubscriptionStates.delete(ctx.from.id);
      
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      await ctx.answerCallbackQuery('⚠️ Ошибка при добавлении');
      await ctx.reply('⚠️ Не удалось добавить подписку. Попробуйте позже.');
    }
  }
}

// Интеграция с Ideas: если юзер предлагает идею про подписки
export function isSubscriptionIdeaTrigger(text: string): boolean {
  const lowerText = text.toLowerCase();
  const subscriptionKeywords = ['подписк', 'subscription', 'трекер подписок'];
  const ideaKeywords = ['идея', 'предлагаю', 'хочу предложить'];
  
  return subscriptionKeywords.some(kw => lowerText.includes(kw)) &&
         ideaKeywords.some(kw => lowerText.includes(kw));
}

export async function suggestSubscriptionSkill(ctx: BotContext) {
  await ctx.reply(
    '💡 О, идея про подписки!\n\n' +
    'У меня уже есть навык отслеживания подписок! 🎉\n\n' +
    'Попробуйте:\n' +
    '• /subscriptions — посмотреть все подписки\n' +
    '• /add_subscription — добавить новую\n' +
    '• /subscription_stats — статистика расходов\n\n' +
    'Или просто напишите: "добавь подписку Netflix 799р в месяц"'
  );
}\n```\n\n# ФАЙЛ: src/handlers/project-callbacks.ts\n```typescript\n/**
 * handlers/project-callbacks.ts — Callback query handlers for project & workflow inline buttons
 * Routes all callback_query:data starting with 'project:' or 'workflow:'.
 */
import { InlineKeyboard } from 'grammy';
import { BotContext } from '../middleware/auth';
import { projectApiClient } from '../services/project-api-client';
import { showProjectList, showTemplateSelection, showProjectMap } from '../commands/project';
import { showWorkflowList, executeWorkflow } from '../commands/workflow';

// Session-like state (per user, in-memory — swap for Redis/Grammy sessions in production)
const userState = new Map<string, {
  awaitingInput?: 'project_title';
  pendingTemplate?: string;
  pendingUploadFileId?: string;
  pendingUploadFileName?: string;
  pendingUploadMimeType?: string;
}>();

export function getUserState(userId: string) {
  if (!userState.has(userId)) {
    userState.set(userId, {});
  }
  return userState.get(userId)!;
}

export function clearUserState(userId: string) {
  userState.delete(userId);
}

/**
 * Main callback router for project: and workflow: prefixes
 */
export async function handleProjectCallbacks(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data || !ctx.user) return;

  try {
    // ── Project callbacks ─────────────────────────────────
    if (data === 'project:list') {
      await showProjectList(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'project:templates') {
      await showTemplateSelection(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith('project:template:')) {
      const templateKey = data.replace('project:template:', '');
      await handleTemplateSelect(ctx, templateKey);
      return;
    }

    if (data.startsWith('project:view:')) {
      const projectId = data.replace('project:view:', '');
      await handleProjectView(ctx, projectId);
      return;
    }

    if (data.startsWith('project:map:')) {
      const projectId = data.replace('project:map:', '');
      await handleProjectMapView(ctx, projectId);
      return;
    }

    if (data.startsWith('project:delete:')) {
      const projectId = data.replace('project:delete:', '');
      await handleProjectDeleteConfirm(ctx, projectId);
      return;
    }

    if (data.startsWith('project:delete_confirm:')) {
      const projectId = data.replace('project:delete_confirm:', '');
      await handleProjectDelete(ctx, projectId);
      return;
    }

    if (data.startsWith('project:upload:')) {
      const projectId = data.replace('project:upload:', '');
      await handleFileUploadToProject(ctx, projectId);
      return;
    }

    if (data === 'project:upload_cancel') {
      clearUserState(ctx.user.id);
      await ctx.editMessageText('❌ Загрузка отменена.');
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Workflow callbacks ────────────────────────────────
    if (data.startsWith('workflow:select:')) {
      const projectId = data.replace('workflow:select:', '');
      await showWorkflowList(ctx, projectId);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith('workflow:run:')) {
      const parts = data.replace('workflow:run:', '').split(':');
      const projectId = parts[0];
      const workflowId = parts[1];
      if (projectId && workflowId) {
        await executeWorkflow(ctx, projectId, workflowId);
      }
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error('Error in project callback:', error);
    await ctx.answerCallbackQuery({ text: '❌ Произошла ошибка' });
  }
}

/** Handle template selection — ask for project title */
async function handleTemplateSelect(ctx: BotContext, templateKey: string) {
  if (!ctx.user) return;

  const state = getUserState(ctx.user.id);
  state.awaitingInput = 'project_title';
  state.pendingTemplate = templateKey;

  const templates = await projectApiClient.listTemplates();
  const selected = templates.find(t => t.key === templateKey);
  const templateName = selected ? `${selected.icon} ${selected.title}` : templateKey;

  await ctx.editMessageText(
    `📝 *Создание проекта*\n\n` +
    `Шаблон: ${templateName}\n\n` +
    `Введите название проекта:`,
    { parse_mode: 'Markdown' },
  );
  await ctx.answerCallbackQuery();
}

/** Handle project view — show details and actions */
async function handleProjectView(ctx: BotContext, projectId: string) {
  if (!ctx.user) return;

  const project = await projectApiClient.getProject(projectId, ctx.user.id);
  if (!project) {
    await ctx.answerCallbackQuery({ text: '❌ Проект не найден' });
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('🗺 Карта', `project:map:${projectId}`)
    .text('⚡ Workflow', `workflow:select:${projectId}`)
    .row()
    .text('🗑 Удалить', `project:delete:${projectId}`)
    .text('⬅️ Назад', 'project:list');

  const icon = project.templateIcon || '📋';
  await ctx.editMessageText(
    `${icon} *${project.title}*\n\n` +
    `📌 Шаблон: ${project.template || 'custom'}\n` +
    `📅 Создан: ${project.createdAt ? new Date(project.createdAt).toLocaleDateString('ru') : '—'}\n` +
    `📊 Статус: ${project.status || 'active'}`,
    { parse_mode: 'Markdown', reply_markup: keyboard },
  );
  await ctx.answerCallbackQuery();
}

/** Show project map from callback */
async function handleProjectMapView(ctx: BotContext, projectId: string) {
  if (!ctx.user) return;
  await showProjectMap(ctx, projectId);
  await ctx.answerCallbackQuery();
}

/** Confirm project deletion */
async function handleProjectDeleteConfirm(ctx: BotContext, projectId: string) {
  const keyboard = new InlineKeyboard()
    .text('✅ Да, удалить', `project:delete_confirm:${projectId}`)
    .text('❌ Отмена', `project:list`);

  await ctx.editMessageText(
    '⚠️ *Удалить проект?*\n\nЭто действие нельзя отменить.',
    { parse_mode: 'Markdown', reply_markup: keyboard },
  );
  await ctx.answerCallbackQuery();
}

/** Execute project deletion */
async function handleProjectDelete(ctx: BotContext, projectId: string) {
  if (!ctx.user) return;

  const deleted = await projectApiClient.deleteProject(projectId, ctx.user.id);
  if (deleted) {
    await ctx.editMessageText('✅ Проект удалён.');
  } else {
    await ctx.editMessageText('❌ Проект не найден.');
  }
  await ctx.answerCallbackQuery();
}

/** Upload pending file to selected project */
async function handleFileUploadToProject(ctx: BotContext, projectId: string) {
  if (!ctx.user) return;

  const state = getUserState(ctx.user.id);
  if (!state.pendingUploadFileId) {
    await ctx.answerCallbackQuery({ text: '❌ Файл не найден' });
    return;
  }

  try {
    const fileInfo = await ctx.api.getFile(state.pendingUploadFileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env['BOT_TOKEN'] || ''}/${fileInfo.file_path}`;

    await projectApiClient.ingestFile(
      projectId,
      ctx.user.id,
      fileUrl,
      state.pendingUploadFileName || 'document',
      state.pendingUploadMimeType || 'application/octet-stream',
    );

    clearUserState(ctx.user.id);

    await ctx.editMessageText('✅ Файл добавлен в проект!');
    await ctx.answerCallbackQuery({ text: '✅ Загружено' });
  } catch (error) {
    console.error('Error uploading file:', error);
    clearUserState(ctx.user.id);
    await ctx.answerCallbackQuery({ text: '❌ Ошибка загрузки' });
  }
}

/**
 * Handle text message when we're awaiting project title input.
 * Returns true if the message was consumed.
 */
export async function handleProjectTextInput(ctx: BotContext): Promise<boolean> {
  if (!ctx.user || !ctx.message?.text) return false;

  const state = getUserState(ctx.user.id);

  if (state.awaitingInput === 'project_title' && state.pendingTemplate) {
    const title = ctx.message.text.trim();
    if (!title) {
      await ctx.reply('❌ Название не может быть пустым. Введите название:');
      return true;
    }

    try {
      await ctx.replyWithChatAction('typing');
      const project = await projectApiClient.createProject(
        ctx.user.id,
        title,
        state.pendingTemplate,
      );

      clearUserState(ctx.user.id);

      const keyboard = new InlineKeyboard()
        .text('🗺 Карта проекта', `project:map:${project.id}`)
        .text('📂 Мои проекты', 'project:list');

      await ctx.reply(
        `✅ *Проект создан!*\n\n📋 ${project.title}\n🆔 \`${project.id}\``,
        { parse_mode: 'Markdown', reply_markup: keyboard },
      );
    } catch (error) {
      console.error('Error creating project:', error);
      clearUserState(ctx.user.id);
      await ctx.reply('❌ Не удалось создать проект. Попробуйте позже.');
    }

    return true;
  }

  return false;
}

/**
 * Handle document/file upload — ask which project to add to.
 * Returns true if the message was consumed.
 */
export async function handleFileUpload(ctx: BotContext): Promise<boolean> {
  if (!ctx.user) return false;

  const doc = ctx.message?.document;
  if (!doc) return false;

  try {
    const projects = await projectApiClient.listProjects(ctx.user.id);

    if (!projects || projects.length === 0) {
      // No projects — don't intercept
      return false;
    }

    // Store file info in state
    const state = getUserState(ctx.user.id);
    state.pendingUploadFileId = doc.file_id;
    state.pendingUploadFileName = doc.file_name || 'document';
    state.pendingUploadMimeType = doc.mime_type || 'application/octet-stream';

    const keyboard = new InlineKeyboard();
    for (const p of projects) {
      const icon = p.templateIcon || '📋';
      keyboard.text(`${icon} ${p.title}`, `project:upload:${p.id}`).row();
    }
    keyboard.text('❌ Не добавлять', 'project:upload_cancel');

    await ctx.reply('📎 *Добавить файл в проект?*', {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });

    return true;
  } catch (error) {
    console.error('Error handling file upload:', error);
    return false;
  }
}\n```\n\n# ФАЙЛ: src/handlers/idea-collector.ts\n```typescript\n/**
 * Сборщик идей через диалоговый флоу.
 * Пошаговый ввод: проблема → аудитория → решение → подтверждение.
 */

import { BotContext } from '../middleware/auth';
import { InlineKeyboard } from 'grammy';
import axios from 'axios';

const IDEAS_API_URL = process.env.IDEAS_API_URL || 'http://localhost:4030/api/v1/ideas';

interface IdeaCollectionState {
  stage: 'problem' | 'audience' | 'solution' | 'confirm';
  data: {
    title: string;
    problem?: string;
    audience?: string;
    solution?: string;
  };
}

// In-memory state (можно потом заменить на Redis)
const ideaCollectionStates = new Map<number, IdeaCollectionState>();

// Триггеры для начала сбора идей
const ideaTriggers = ['идея', 'предлагаю', 'хочу предложить', 'у меня идея', 'предложение'];

export function isIdeaTrigger(text: string): boolean {
  const lowerText = text.toLowerCase();
  return ideaTriggers.some(trigger => lowerText.includes(trigger));
}

export async function handleIdeaCollection(ctx: BotContext) {
  if (!ctx.from || !ctx.message?.text) return;

  const userId = ctx.from.id;
  const messageText = ctx.message.text;

  // Если пользователь в процессе сбора идеи
  if (ideaCollectionStates.has(userId)) {
    await handleIdeaCollectionStep(ctx, userId, messageText);
    return;
  }

  // Начало сбора идеи
  await startIdeaCollection(ctx, messageText);
}

async function startIdeaCollection(ctx: BotContext, messageText: string) {
  if (!ctx.from) return;
  
  const userId = ctx.from.id;
  
  // Извлекаем title из первого сообщения
  // Убираем триггеры из текста
  let title = messageText;
  ideaTriggers.forEach(trigger => {
    const regex = new RegExp(trigger, 'gi');
    title = title.replace(regex, '').trim();
  });
  
  // Убираем тире, двоеточия в начале
  title = title.replace(/^[-:—]+\s*/, '').trim();
  
  if (title.length < 10) {
    await ctx.reply('Расскажите подробнее о своей идее (минимум 10 символов)');
    return;
  }

  await ctx.reply('🔍 Проверяю, есть ли похожие идеи...');

  try {
    // Поиск похожих идей через semantic search
    const response = await axios.get(`${IDEAS_API_URL}/search`, {
      params: { q: title, limit: 3 }
    });

    const similarIdeas = response.data.filter((idea: any) => idea.similarity > 0.7);

    if (similarIdeas.length > 0) {
      // Нашли похожие идеи
      await ctx.reply('💡 Нашла похожие идеи! Может вы имели в виду:');

      const keyboard = new InlineKeyboard();
      
      for (const idea of similarIdeas) {
        const similarity = Math.round(idea.similarity * 100);
        keyboard.text(
          `👍 ${idea.title.slice(0, 40)}... (${similarity}%)`,
          `vote_idea_${idea.id}`
        );
        keyboard.row();
      }
      
      keyboard.text('➕ Нет, создать новую идею', 'create_new_idea');
      
      // Сохраняем title на случай создания новой идеи
      ideaCollectionStates.set(userId, {
        stage: 'problem',
        data: { title }
      });

      await ctx.reply(
        'Выберите действие:',
        { reply_markup: keyboard }
      );
    } else {
      // Не нашли похожих, начинаем опрос
      await startIdeaQuestionnaire(ctx, userId, title);
    }
  } catch (error) {
    console.error('Error searching similar ideas:', error);
    await ctx.reply('⚠️ Ошибка поиска похожих идей. Попробуйте позже.');
  }
}

async function startIdeaQuestionnaire(ctx: BotContext, userId: number, title: string) {
  ideaCollectionStates.set(userId, {
    stage: 'problem',
    data: { title }
  });

  await ctx.reply(
    `✅ Отлично! Давайте оформим вашу идею:\n\n📝 "${title}"\n\n❓ Какую проблему это решает?`
  );
}

async function handleIdeaCollectionStep(ctx: BotContext, userId: number, messageText: string) {
  const state = ideaCollectionStates.get(userId);
  if (!state) return;

  switch (state.stage) {
    case 'problem':
      state.data.problem = messageText;
      state.stage = 'audience';
      await ctx.reply('👥 Для кого это будет полезно? (например: студенты, предприниматели, все пользователи)');
      break;

    case 'audience':
      state.data.audience = messageText;
      state.stage = 'solution';
      await ctx.reply('⚙️ Как примерно должно работать? (краткое описание)');
      break;

    case 'solution':
      state.data.solution = messageText;
      state.stage = 'confirm';
      
      const keyboard = new InlineKeyboard()
        .text('✅ Да, создать', 'confirm_idea_create')
        .text('❌ Отменить', 'cancel_idea_create');

      await ctx.reply(
        `📋 Проверьте идею:\n\n` +
        `💡 *Идея:* ${state.data.title}\n\n` +
        `❓ *Проблема:* ${state.data.problem}\n\n` +
        `👥 *Аудитория:* ${state.data.audience}\n\n` +
        `⚙️ *Как работает:* ${state.data.solution}\n\n` +
        `Все верно?`,
        { 
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        }
      );
      break;
  }

  ideaCollectionStates.set(userId, state);
}

export async function handleIdeaCallbacks(ctx: BotContext) {
  if (!ctx.callbackQuery?.data || !ctx.from || !ctx.user) return;

  const callbackData = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  if (callbackData.startsWith('vote_idea_')) {
    const ideaId = callbackData.replace('vote_idea_', '');
    
    try {
      await axios.post(
        `${IDEAS_API_URL}/${ideaId}/vote`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${ctx.user.id}`,
            'Content-Type': 'application/json'
          }
        }
      );

      await ctx.answerCallbackQuery('✅ Голос учтен!');
      await ctx.reply('👍 Спасибо за поддержку идеи! Следите за её статусом на grandhub.ru/ideas');
      
      // Очищаем состояние
      ideaCollectionStates.delete(userId);
    } catch (error: any) {
      if (error.response?.data?.error === 'Already voted') {
        await ctx.answerCallbackQuery('⚠️ Вы уже голосовали за эту идею');
      } else {
        console.error('Vote error:', error);
        await ctx.answerCallbackQuery('⚠️ Ошибка при голосовании');
      }
    }
  } else if (callbackData === 'create_new_idea') {
    const state = ideaCollectionStates.get(userId);
    if (state) {
      await startIdeaQuestionnaire(ctx, userId, state.data.title);
    }
    await ctx.answerCallbackQuery();
  } else if (callbackData === 'confirm_idea_create') {
    await createIdea(ctx, userId);
    await ctx.answerCallbackQuery();
  } else if (callbackData === 'cancel_idea_create') {
    ideaCollectionStates.delete(userId);
    await ctx.answerCallbackQuery('Отменено');
    await ctx.reply('❌ Создание идеи отменено');
  }
}

async function createIdea(ctx: BotContext, userId: number) {
  const state = ideaCollectionStates.get(userId);
  if (!state || !ctx.user) return;

  const { title, problem, audience, solution } = state.data;

  // Формируем полное описание
  const description = `
**Проблема:** ${problem}

**Аудитория:** ${audience}

**Как работает:** ${solution}
  `.trim();

  try {
    const response = await axios.post(
      IDEAS_API_URL,
      {
        title,
        description,
        category: 'feature', // По умолчанию feature
        authorName: ctx.from?.username || ctx.from?.first_name || 'Аноним',
        metadata: {
          source: 'telegram_bot',
          problem,
          audience,
          solution
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${ctx.user.id}`,
          'Content-Type': 'application/json'
        }
      }
    );

    await ctx.reply(
      '✅ Идея добавлена! Следите за статусом на https://grandhub.ru/ideas\n\n' +
      'Другие пользователи смогут проголосовать за неё, и мы возьмём её в работу! 🚀'
    );

    ideaCollectionStates.delete(userId);
  } catch (error) {
    console.error('Create idea error:', error);
    await ctx.reply('⚠️ Ошибка при создании идеи. Попробуйте позже.');
  }
}

// Экспортируем функцию проверки состояния
export function isInIdeaCollection(userId: number): boolean {
  return ideaCollectionStates.has(userId);
}\n```\n\n# ФАЙЛ: src/handlers/callback.ts\n```typescript\n/**
 * Центральный роутер callback_query.
 * Распределяет inline-кнопки по обработчикам: проекты, идеи, подписки, настройки.
 */

import { BotContext } from '../middleware/auth';
import { texts } from '../config/texts';
// import { apiClient } from '../services/api-client';
import { getSkillsKeyboard, UserSkills } from '../keyboards/skills';
import { getPlansKeyboard, PlanType } from '../keyboards/plans';
import { getMainMenuKeyboard, getLearnMoreKeyboard } from '../keyboards/main-menu';
import { startOnboarding, handleOnboardingCallback } from './onboarding';
import { handleIdeaCallbacks } from './idea-collector';
import { handleSubscriptionCallbacks } from './subscriptions';
import { handleMoodCallbacks } from './mood';
import { handleSiteBuilderCallback } from './site-builder';
import { handleHabitCallbacks } from './habits';
import { handleProjectCallbacks } from './project-callbacks';
import { handleSettingsCallback } from '../commands/settings';

export async function handleCallback(ctx: BotContext) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data) return;

    // ⚙️ Settings callbacks
    if (data.startsWith('settings:')) {
      await handleSettingsCallback(ctx);
      return;
    }

    // 📂 Project & Workflow callbacks
    if (data.startsWith('project:') || data.startsWith('workflow:')) {
      await handleProjectCallbacks(ctx);
      return;
    }

    // 💡 Проверяем idea callbacks в первую очередь
    if (data.startsWith('vote_idea_') || 
        data === 'create_new_idea' || 
        data === 'confirm_idea_create' || 
        data === 'cancel_idea_create') {
      await handleIdeaCallbacks(ctx);
      return;
    }

    // 🎨 Site Builder callbacks
    // 😊 Mood tracker callbacks
    if (data.startsWith('mood_')) {
      await handleMoodCallbacks(ctx);
      return;
    }

    // 🎯 Habit tracker callbacks
    if (data.startsWith('habit_')) {
      await handleHabitCallbacks(ctx);
      return;
    }
    if (data.startsWith('site_') || data === 'sites_list' || data === 'sites_create') {
      await handleSiteBuilderCallback(ctx, data);
      return;
    }

    // Новые onboarding callbacks (из welcome keyboard)
    if (data === 'onboarding:examples') {
      const examples = `💡 **Примеры того, что я умею:**

🏦 Финансы:
• "Потратил 1500₽ на продукты"
• "Покажи мои расходы за неделю"
• "Сколько я трачу на транспорт?"

📅 Расписание:
• "Напомни завтра в 10:00 позвонить врачу"
• "Что у меня на сегодня?"
• "Добавь встречу на пятницу в 14:00"

🛒 Покупки:
• "Добавь молоко, хлеб и яйца в список"
• "Что в моём списке покупок?"
• "Где дешевле купить iPhone?"

Попробуй прямо сейчас! 🚀`;
      await ctx.editMessageText(examples, { parse_mode: 'Markdown' });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'onboarding:settings') {
      await ctx.answerCallbackQuery();
      await ctx.reply('⚙️ Настройки откроются позже. Пока просто напиши мне что-нибудь!');
      return;
    }

    if (data === 'onboarding:skills') {
      const skillsInfo = `🎯 **Доступные навыки:**

✅ **Активны** (FREE тариф):
🏦 Финансы и бюджет
📅 Расписание и напоминания
🛒 Списки покупок

💎 **Доступны на PRO:**
💪 Здоровье и тренировки
📚 Обучение и языки
✈️ Путешествия и отели

Хочешь больше навыков? → /plan`;
      await ctx.editMessageText(skillsInfo, { parse_mode: 'Markdown' });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'onboarding:skip') {
      await ctx.editMessageText('✨ Отлично! Просто напиши мне что-нибудь и начнём работать.');
      await ctx.answerCallbackQuery();
      return;
    }

    // Старые онбординг callbacks
    if (data === 'onboarding_start') {
      await startOnboarding(ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    if (data.startsWith('onb_')) {
      await handleOnboardingCallback(ctx, data);
      return;
    }

    if (data === 'onboarding_skills_done') {
      await handleOnboardingCallback(ctx, data);
      return;
    }

    // Main menu callbacks
    if (data === 'learn_more') {
      await ctx.editMessageReplyMarkup({ reply_markup: getLearnMoreKeyboard() });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'back_to_start') {
      await ctx.editMessageText(texts.start.welcome, {
        reply_markup: getMainMenuKeyboard()
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'show_skills') {
      if (!ctx.user) return;
      const defaultSkills = { finance: true, schedule: true, shopping: true, health: false, learning: false, travel: false };
      await ctx.editMessageText(texts.skills.description, {
        reply_markup: getSkillsKeyboard(defaultSkills)
      });
      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'show_plans') {
      if (!ctx.user) return;
      const currentPlan = (ctx.user.plan || 'free').toLowerCase();
      const planText = (texts.plan as any)[currentPlan] || texts.plan.free;
      const message = `${texts.plan.title}\n\n**${planText.name}**\n${planText.description}`;
      await ctx.editMessageText(message, {
        reply_markup: getPlansKeyboard(currentPlan as PlanType),
        parse_mode: 'Markdown'
      });
      await ctx.answerCallbackQuery();
      return;
    }

    // Skills callbacks
    if (data.startsWith('toggle_skill_')) {
      if (!ctx.user) return;

      const skillKey = data.replace('toggle_skill_', '') as keyof UserSkills;
      const updatedSkills = { ...ctx.user.skills };
      updatedSkills[skillKey] = !updatedSkills[skillKey];

      // Обновляем клавиатуру
      await ctx.editMessageReplyMarkup({
        reply_markup: getSkillsKeyboard(updatedSkills)
      });

      // Обновляем пользователя в контексте
      ctx.user.skills = updatedSkills;

      await ctx.answerCallbackQuery();
      return;
    }

    if (data === 'save_skills') {
      if (!ctx.user) return;
      // TODO: Save skills via API when ready
      await ctx.answerCallbackQuery({ text: texts.skills.updated });
      await ctx.editMessageText(texts.skills.updated);
      return;
    }

    // Plan callbacks
    if (data.startsWith('upgrade_') || data.startsWith('downgrade_')) {
      if (!ctx.user) return;
      // TODO: Upgrade plan via billing API
      await ctx.answerCallbackQuery({ text: '💎 Оплата тарифов скоро будет доступна!' });
      return;
    }

    // Settings callbacks
    if (data === 'settings_language') {
      await ctx.answerCallbackQuery({ text: 'Скоро будут доступны другие языки!' });
      return;
    }

    if (data === 'settings_notifications') {
      // TODO: Toggle notifications via API
      await ctx.answerCallbackQuery({ text: 'Настройки уведомлений скоро!' });
      return;
    }

    if (data === 'settings_timezone') {
      await ctx.answerCallbackQuery({ text: 'Функция в разработке' });
      return;
    }

    // Assistants callbacks
    if (data.startsWith('switch_assistant:')) {
      // TODO: Реализовать переключение между помощниками через API
      // const assistantId = data.replace('switch_assistant:', '');
      // await apiClient.switchAssistant(ctx.user.id, assistantId);
      await ctx.answerCallbackQuery({ text: 'Помощник переключён!' });
      await ctx.editMessageText('✅ Помощник успешно переключён!');
      return;
    }

    if (data === 'create_assistant') {
      // TODO: Реализовать создание нового помощника
      await ctx.answerCallbackQuery({ text: 'Функция в разработке' });
      return;
    }

    // Close callback
    if (data === 'close') {
      await ctx.deleteMessage();
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error('Error in callback handler:', error);
    await ctx.answerCallbackQuery({ text: texts.errors.general });
  }
}\n```\n\n# ФАЙЛ: src/handlers/onboarding.ts\n```typescript\n/**
 * Пошаговый онбординг нового пользователя.
 * Ввод имени → выбор навыков → завершение настройки.
 */

import { BotContext } from '../middleware/auth';
import { texts } from '../config/texts';
import { getOnboardingSkillsKeyboard, UserSkills } from '../keyboards/skills';
import { apiClient } from '../services/api-client';

interface OnboardingState {
  step: 'name' | 'skills' | 'done';
  selectedSkills: Partial<UserSkills>;
}

// Временное хранилище состояний онбординга (в prod - Redis)
const onboardingStates = new Map<number, OnboardingState>();

export async function startOnboarding(ctx: BotContext) {
  try {
    if (!ctx.from) return;

    onboardingStates.set(ctx.from.id, {
      step: 'name',
      selectedSkills: {}
    });

    await ctx.reply(texts.onboarding.step1);
  } catch (error) {
    console.error('Error starting onboarding:', error);
    await ctx.reply(texts.errors.general);
  }
}

export async function handleOnboardingMessage(ctx: BotContext) {
  try {
    if (!ctx.from || !ctx.message?.text || !ctx.user) return;

    const state = onboardingStates.get(ctx.from.id);
    if (!state) return;

    if (state.step === 'name') {
      const name = ctx.message.text.trim();
      
      // Сохраняем имя
      await apiClient.updateUser(ctx.user.id, { name });

      await ctx.reply(texts.onboarding.name_saved.replace('{name}', name));

      // Переходим к выбору навыков
      state.step = 'skills';
      onboardingStates.set(ctx.from.id, state);

      await ctx.reply(texts.onboarding.step2, {
        reply_markup: getOnboardingSkillsKeyboard()
      });
    }
  } catch (error) {
    console.error('Error handling onboarding message:', error);
    await ctx.reply(texts.errors.general);
  }
}

export async function handleOnboardingCallback(ctx: BotContext, action: string) {
  try {
    if (!ctx.from || !ctx.user) return;

    const state = onboardingStates.get(ctx.from.id);
    if (!state) return;

    if (action.startsWith('onb_skill_')) {
      const skillKey = action.replace('onb_skill_', '') as keyof UserSkills;
      
      // Toggle навыка
      state.selectedSkills[skillKey] = !state.selectedSkills[skillKey];
      onboardingStates.set(ctx.from.id, state);

      // Обновляем клавиатуру
      const keyboard = getOnboardingSkillsKeyboard();
      // TODO: обновить статус кнопок на основе selectedSkills

      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery();
    } 
    else if (action === 'onboarding_skills_done') {
      // Сохраняем выбранные навыки
      const skills: UserSkills = {
        finance: state.selectedSkills.finance || false,
        schedule: state.selectedSkills.schedule || false,
        shopping: state.selectedSkills.shopping || false,
        health: state.selectedSkills.health || false,
        learning: state.selectedSkills.learning || false,
        travel: state.selectedSkills.travel || false
      };

      await apiClient.updateUser(ctx.user.id, { skills });

      // Завершаем онбординг
      onboardingStates.delete(ctx.from.id);

      await ctx.editMessageText(texts.onboarding.step3);
      await ctx.answerCallbackQuery();
    }
  } catch (error) {
    console.error('Error handling onboarding callback:', error);
    await ctx.answerCallbackQuery({ text: texts.errors.general });
  }
}

export function isInOnboarding(userId: number): boolean {
  return onboardingStates.has(userId);
}

export function getOnboardingState(userId: number): OnboardingState | undefined {
  return onboardingStates.get(userId);
}\n```\n\n# ФАЙЛ: src/handlers/habits.ts\n```typescript\n/**
 * Обработчики callback-кнопок привычек.
 * Быстрое создание привычки из шаблона, отметка выполнения.
 */

import { BotContext } from '../middleware/auth';
import axios from 'axios';

const HABITS_SERVICE_URL = process.env.HABITS_SERVICE_URL || 'http://localhost:3025';

export async function handleHabitCallbacks(ctx: BotContext) {
  try {
    const data = ctx.callbackQuery?.data;
    if (!data || !ctx.user) return;

    // habit_quick_* - быстрое создание привычки
    if (data.startsWith('habit_quick_')) {
      const type = data.replace('habit_quick_', '');
      const templates: Record<string, any> = {
        reading: { name: 'Читать 30 минут', icon: '📚', color: '#3F51B5' },
        sport: { name: 'Делать зарядку', icon: '🏃', color: '#FF5722' },
        meditation: { name: 'Медитировать 10 минут', icon: '🧘', color: '#9C27B0' },
        water: { name: 'Пить 2 литра воды', icon: '💧', color: '#2196F3' },
      };

      const template = templates[type];
      if (!template) return;

      try {
        await axios.post(
          `${HABITS_SERVICE_URL}/api/habits`,
          {
            name: template.name,
            description: '',
            frequency: 'DAILY',
            targetDays: 21,
            color: template.color,
            icon: template.icon,
          },
          { headers: { 'x-user-id': ctx.user.id } }
        );

        await ctx.editMessageText(
          `✅ Привычка "${template.name}" создана!\n\n` +
          `🎯 Цель: 21 день\n` +
          `📊 Отмечайте выполнение командой /habit_done\n\n` +
          `Удачи! ${template.icon}`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        console.error('Error creating quick habit:', error);
        await ctx.answerCallbackQuery({ text: '❌ Ошибка при создании привычки' });
      }
      return;
    }

    // habit_custom - кастомная привычка
    if (data === 'habit_custom') {
      await ctx.editMessageText(
        '✍️ Напишите название вашей привычки.\n\n' +
        '*Примеры:*\n' +
        '• учить 10 новых слов\n' +
        '• ложиться спать до 23:00\n' +
        '• звонить родителям\n' +
        '• писать в дневник',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // habit_done_* - отметить выполнение
    if (data.startsWith('habit_done_')) {
      const habitId = data.replace('habit_done_', '');

      try {
        const response = await axios.post(
          `${HABITS_SERVICE_URL}/api/habits/${habitId}/complete`,
          { note: '' },
          { headers: { 'x-user-id': ctx.user.id } }
        );

        const result = response.data;

        let message = `✅ Привычка отмечена!\n\n`;
        message += `🔥 Streak: ${result.currentStreak} ${getDaysWord(result.currentStreak)}\n`;

        if (result.isNewRecord) {
          message += `🏆 *Новый рекорд!*\n`;
        }

        if (result.milestoneReached) {
          message += `\n🎉 ${result.milestoneReached.message}\n`;
          if (result.milestoneReached.pointsEarned) {
            message += `💎 +${result.milestoneReached.pointsEarned} очков!\n`;
          }
        }

        if (result.aiMessage) {
          message += `\n💬 ${result.aiMessage}`;
        }

        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      } catch (error: any) {
        if (error.response?.status === 409) {
          await ctx.answerCallbackQuery({ text: '⚠️ Вы уже отмечали эту привычку сегодня!' });
        } else {
          await ctx.answerCallbackQuery({ text: '❌ Ошибка при отметке привычки' });
        }
      }
      return;
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error('Error in habit callbacks:', error);
    await ctx.answerCallbackQuery({ text: '❌ Произошла ошибка' });
  }
}


function getDaysWord(count: number): string {
  const cases = [2, 0, 1, 1, 1, 2];
  const titles = ["день", "дня", "дней"];
  const index = count % 100 > 4 && count % 100 < 20
    ? 2
    : cases[Math.min(count % 10, 5)];
  return titles[index] || "дней";
}\n```\n