import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  fetchAllParticipants,
  updateParticipantStatus,
  appendWalkinParticipant,
  fetchFormOptions,
  fetchSystemPassword,
  fetchPublicSettings,
} from './googleSheets';
import {
  EnvironmentVariables,
  Participant,
  UpdateStatusRequest,
  WalkinRegistrationRequest,
  FormOptionsData,
  PublicSettingsData,
  ApiResponse,
} from './types';

// Honoアプリケーションの初期化
const app = new Hono<{ Bindings: EnvironmentVariables }>();

// CORSミドルウェアの設定
app.use('*', async (context, next) => {
  const allowedOrigin = context.env.CORS_ORIGIN || '*';
  const corsMiddleware = cors({
    origin: allowedOrigin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });
  return corsMiddleware(context, next);
});

/**
 * ヘルスチェック用エンドポイント
 */
app.get('/api/health', (context) => {
  return context.json<ApiResponse<{ status: string; timestamp: string }>>({
    success: true,
    data: {
      status: 'operational',
      timestamp: new Date().toISOString(),
    },
  });
});

// ==========================================
// インメモリキャッシュ定義
// ==========================================

// 1. 参加者一覧キャッシュ (TTL: 5秒)
interface ParticipantsCache {
  data: Participant[];
  timestamp: number;
}
let cachedParticipants: ParticipantsCache | null = null;
const PARTICIPANTS_CACHE_TTL_MS = 5000;

/**
 * 参加者一覧キャッシュを無効化（パージ）
 */
function clearParticipantsCache(): void {
  cachedParticipants = null;
}

// 2. パスワードキャッシュ (TTL: 60秒)
interface PasswordCache {
  password: string;
  timestamp: number;
}
let cachedPassword: PasswordCache | null = null;
const PASSWORD_CACHE_TTL_MS = 60000;

// 3. 選択肢マスタ用インメモリキャッシュ（TTL: 30秒）
interface OptionsCache {
  data: FormOptionsData;
  timestamp: number;
}
let cachedOptions: OptionsCache | null = null;
const OPTIONS_CACHE_TTL_MS = 30000;

// 4. 公開設定情報用インメモリキャッシュ（TTL: 60秒）
interface SettingsCache {
  data: PublicSettingsData;
  timestamp: number;
}
let cachedSettings: SettingsCache | null = null;
const SETTINGS_CACHE_TTL_MS = 60000;

// ==========================================
// APIエンドポイント
// ==========================================

/**
 * 1. 参加者一覧データ取得API (TTL 5秒キャッシュ)
 * GET /api/participants
 */
app.get('/api/participants', async (context) => {
  try {
    const now = Date.now();

    // 5秒以内の有効なキャッシュがあれば即座に返却
    if (cachedParticipants && (now - cachedParticipants.timestamp < PARTICIPANTS_CACHE_TTL_MS)) {
      return context.json<ApiResponse<Participant[]>>({
        success: true,
        count: cachedParticipants.data.length,
        data: cachedParticipants.data,
      });
    }

    // 5秒経過時はSheets APIから最新取得
    const participants = await fetchAllParticipants(context.env);

    cachedParticipants = {
      data: participants,
      timestamp: Date.now(),
    };

    return context.json<ApiResponse<typeof participants>>({
      success: true,
      count: participants.length,
      data: participants,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '参加者データの取得中にエラーが発生しました。';
    console.error('[API Error: GET /api/participants]', errorMessage);
    return context.json<ApiResponse>({ success: false, error: errorMessage }, 500);
  }
});

/**
 * 2. 受付ステータス更新API (キャッシュ即時パージ)
 * POST /api/update
 */
app.post('/api/update', async (context) => {
  try {
    const body = await context.req.json<UpdateStatusRequest>();

    if (!body.id) {
      return context.json<ApiResponse>(
        { success: false, error: 'システムID（id）が指定されていません。' },
        400
      );
    }

    const updatedData = await updateParticipantStatus(context.env, body);

    // 更新成功時にキャッシュを即座に破棄（パージ）
    clearParticipantsCache();

    return context.json<ApiResponse<typeof updatedData>>({
      success: true,
      message: 'ステータスを正常に更新しました。',
      data: updatedData,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'ステータス更新中にエラーが発生しました。';
    console.error('[API Error: POST /api/update]', errorMessage);
    return context.json<ApiResponse>({ success: false, error: errorMessage }, 500);
  }
});

/**
 * 3. 当日参加者新規登録API (キャッシュ即時パージ)
 * POST /api/walkin
 */
app.post('/api/walkin', async (context) => {
  try {
    const body = await context.req.json<WalkinRegistrationRequest>();

    if (!body.lastName || !body.firstName) {
      return context.json<ApiResponse>({ success: false, error: '氏名は必須項目です。' }, 400);
    }
    if (!body.lastNameKana || !body.firstNameKana) {
      return context.json<ApiResponse>({ success: false, error: 'フリガナは必須項目です。' }, 400);
    }

    const createdParticipant = await appendWalkinParticipant(context.env, body);

    // 登録成功時にキャッシュを即座に破棄（パージ）
    clearParticipantsCache();

    return context.json<ApiResponse<typeof createdParticipant>>({
      success: true,
      message: '当日受付の登録が完了しました。',
      data: createdParticipant,
    }, 201);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '当日参加者の登録中にエラーが発生しました。';
    console.error('[API Error: POST /api/walkin]', errorMessage);
    return context.json<ApiResponse>({ success: false, error: errorMessage }, 500);
  }
});

/**
 * 4. 選択肢マスタ取得API
 * GET /api/options
 */
app.get('/api/options', async (context) => {
  try {
    const now = Date.now();
    if (cachedOptions && (now - cachedOptions.timestamp < OPTIONS_CACHE_TTL_MS)) {
      return context.json<ApiResponse<FormOptionsData>>({
        success: true,
        data: cachedOptions.data,
      });
    }

    const options = await fetchFormOptions(context.env);
    cachedOptions = { data: options, timestamp: Date.now() };

    return context.json<ApiResponse<FormOptionsData>>({
      success: true,
      data: options,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '選択肢マスタの取得中にエラーが発生しました。';
    console.error('[API Error: GET /api/options]', errorMessage);
    return context.json<ApiResponse>({ success: false, error: errorMessage }, 500);
  }
});

/**
 * 5. スプレッドシート連動パスワード認証API
 * POST /api/auth
 */
app.post('/api/auth', async (context) => {
  try {
    const body = await context.req.json<{ password?: string }>();
    const inputPassword = (body.password || '').trim();

    if (!inputPassword) {
      return context.json<ApiResponse>(
        { success: false, error: 'パスワードを入力してください。' },
        400
      );
    }

    // パスワードをキャッシュまたはスプレッドシートから取得
    const now = Date.now();
    let currentPassword = '1204';

    if (cachedPassword && (now - cachedPassword.timestamp < PASSWORD_CACHE_TTL_MS)) {
      currentPassword = cachedPassword.password;
    } else {
      currentPassword = await fetchSystemPassword(context.env);
      cachedPassword = { password: currentPassword, timestamp: Date.now() };
    }

    // パスワード照合
    if (inputPassword === currentPassword) {
      return context.json<ApiResponse<{ authenticated: boolean }>>({
        success: true,
        message: '認証に成功しました。',
        data: { authenticated: true },
      });
    } else {
      return context.json<ApiResponse>(
        { success: false, error: 'パスワードが正しくありません。' },
        401
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '認証処理中にエラーが発生しました。';
    console.error('[API Error: POST /api/auth]', errorMessage);
    return context.json<ApiResponse>({ success: false, error: errorMessage }, 500);
  }
});

/**
 * 6. 公開設定情報（大会名等）取得API (新設 - TTL 60秒キャッシュ)
 * GET /api/settings
 */
app.get('/api/settings', async (context) => {
  try {
    const now = Date.now();
    if (cachedSettings && (now - cachedSettings.timestamp < SETTINGS_CACHE_TTL_MS)) {
      return context.json<ApiResponse<PublicSettingsData>>({
        success: true,
        data: cachedSettings.data,
      });
    }

    const settings = await fetchPublicSettings(context.env);
    cachedSettings = { data: settings, timestamp: Date.now() };

    return context.json<ApiResponse<PublicSettingsData>>({
      success: true,
      data: settings,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '設定情報の取得中にエラーが発生しました。';
    console.error('[API Error: GET /api/settings]', errorMessage);
    return context.json<ApiResponse>({ success: false, error: errorMessage }, 500);
  }
});

// 404 & エラーハンドラー
app.notFound((context) => context.json<ApiResponse>({ success: false, error: '指定されたエンドポイントは存在しません。' }, 404));
app.onError((error, context) => {
  console.error('[Unhandled Error]', error);
  return context.json<ApiResponse>({ success: false, error: error.message || '内部エラーが発生しました。' }, 500);
});

export default app;
