import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  fetchAllParticipants,
  updateParticipantStatus,
  appendWalkinParticipant,
} from './googleSheets';
import {
  EnvironmentVariables,
  UpdateStatusRequest,
  WalkinRegistrationRequest,
  ApiResponse,
} from './types';

// Honoアプリケーションの初期化（環境変数バインディングの型を指定）
const app = new Hono<{ Bindings: EnvironmentVariables }>();

// CORSミドルウェアの設定（全オリジンまたは指定オリジンからのアクセスを許可）
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

/**
 * 1. 参加者一覧データ取得API
 * GET /api/participants
 * スプレッドシートの全参加者データ（22列）を取得してJSON形式で返却
 */
app.get('/api/participants', async (context) => {
  try {
    const participants = await fetchAllParticipants(context.env);

    return context.json<ApiResponse<typeof participants>>({
      success: true,
      count: participants.length,
      data: participants,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '参加者データの取得中にエラーが発生しました。';
    console.error('[API Error: GET /api/participants]', errorMessage);

    return context.json<ApiResponse>(
      {
        success: false,
        error: errorMessage,
      },
      500
    );
  }
});

/**
 * 2. 受付ステータス更新API
 * POST /api/update
 * 「受付状況」「弁当引換」「参加費支払」のフラグを更新し、最終更新日時を記録
 */
app.post('/api/update', async (context) => {
  try {
    const body = await context.req.json<UpdateStatusRequest>();

    // 必須パラメータの検証
    if (!body.id) {
      return context.json<ApiResponse>(
        {
          success: false,
          error: 'システムID（id）が指定されていません。',
        },
        400
      );
    }

    const updatedData = await updateParticipantStatus(context.env, body);

    return context.json<ApiResponse<typeof updatedData>>({
      success: true,
      message: 'ステータスを正常に更新しました。',
      data: updatedData,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'ステータス更新中にエラーが発生しました。';
    console.error('[API Error: POST /api/update]', errorMessage);

    return context.json<ApiResponse>(
      {
        success: false,
        error: errorMessage,
      },
      500
    );
  }
});

/**
 * 3. 当日参加者新規登録API
 * POST /api/walkin
 * 当日参加者フォームからの登録を受け付け、UUIDを自動採番してスプレッドシートへ追加
 */
app.post('/api/walkin', async (context) => {
  try {
    const body = await context.req.json<WalkinRegistrationRequest>();

    // 必須入力項目の簡易バリデーション
    if (!body.lastName || !body.firstName) {
      return context.json<ApiResponse>(
        {
          success: false,
          error: '氏名（姓・名）は必須項目です。',
        },
        400
      );
    }

    if (!body.lastNameKana || !body.firstNameKana) {
      return context.json<ApiResponse>(
        {
          success: false,
          error: 'フリガナ（姓・名）は必須項目です。',
        },
        400
      );
    }

    const createdParticipant = await appendWalkinParticipant(context.env, body);

    return context.json<ApiResponse<typeof createdParticipant>>({
      success: true,
      message: '当日受付の登録が完了しました。',
      data: createdParticipant,
    }, 201);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '当日参加者の登録中にエラーが発生しました。';
    console.error('[API Error: POST /api/walkin]', errorMessage);

    return context.json<ApiResponse>(
      {
        success: false,
        error: errorMessage,
      },
      500
    );
  }
});

// 404 Not Found ハンドラー
app.notFound((context) => {
  return context.json<ApiResponse>(
    {
      success: false,
      error: '指定されたエンドポイントは存在しません。',
    },
    404
  );
});

// グローバルエラーハンドラー
app.onError((error, context) => {
  console.error('[Unhandled Error]', error);
  return context.json<ApiResponse>(
    {
      success: false,
      error: error.message || '予期せぬ内部エラーが発生しました。',
    },
    500
  );
});

export default app;
