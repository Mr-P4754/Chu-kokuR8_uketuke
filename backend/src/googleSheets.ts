import { EnvironmentVariables, Participant, UpdateStatusRequest, WalkinRegistrationRequest } from './types';

/**
 * トークンキャッシュ用インターフェース
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number; // エポックミリ秒
}

// メモリ内のアクセストークンキャッシュ
let memoryCachedToken: CachedToken | null = null;

/**
 * 日本時間（JST）の日時文字列（YYYY-MM-DD HH:mm:ss）を生成
 */
export function getJstTimestamp(): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // yyyy/MM/dd HH:mm:ss を yyyy-MM-dd HH:mm:ss に整形
  return formatter.format(new Date()).replace(/\//g, '-');
}

/**
 * 文字列をBase64URLエンコード
 */
function base64UrlEncode(input: string | Uint8Array): string {
  let binaryString = '';
  if (typeof input === 'string') {
    const utf8Bytes = new TextEncoder().encode(input);
    for (let index = 0; index < utf8Bytes.length; index++) {
      binaryString += String.fromCharCode(utf8Bytes[index]);
    }
  } else {
    for (let index = 0; index < input.length; index++) {
      binaryString += String.fromCharCode(input[index]);
    }
  }
  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * PEM形式の秘密鍵をバイナリ（ArrayBuffer）にデコード
 */
function pemToArrayBuffer(pemKey: string): ArrayBuffer {
  const cleanedKey = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\r?\n|\r/g, '')
    .replace(/\\n/g, '')
    .trim();

  const binaryString = atob(cleanedKey);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index++) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * Web Crypto APIを用いてGoogle OAuth2アクセストークンを取得
 */
async function getGoogleAccessToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // キャッシュが有効な場合は再利用（有効期限の60秒前まで有効）
  if (memoryCachedToken && memoryCachedToken.expiresAt > Date.now() + 60000) {
    return memoryCachedToken.accessToken;
  }

  // 1. JWTヘッダーとペイロードの作成
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowInSeconds + 3600, // 1時間有効
    iat: nowInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // 2. RS256秘密鍵のインポートと署名
  const keyBuffer = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));
  const signedJwt = `${unsignedToken}.${encodedSignature}`;

  // 3. Google OAuth2トークンエンドポイントへのリクエスト
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Google認証トークンの取得に失敗しました: ${tokenResponse.status} ${errorBody}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string; expires_in: number };
  memoryCachedToken = {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };

  return tokenData.access_token;
}

/**
 * 指数バックオフを用いたFetchリトライラッパー関数
 * 429 (Rate Limit) や 500, 503 等のエラー発生時に自動再試行を実施
 */
async function fetchWithExponentialBackoff(
  url: string,
  options: RequestInit,
  maxRetries = 4,
  initialDelayMs = 500
): Promise<Response> {
  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (true) {
    try {
      const response = await fetch(url, options);

      // 成功時またはクライアント起因の4xxエラー（429除く）はそのまま返却
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }

      // レートリミット (429) またはサーバーエラー (5xx) の場合はリトライ判定
      if (attempt >= maxRetries) {
        return response;
      }

      // Retry-Afterヘッダーが存在する場合はその待機時間を優先
      const retryAfterHeader = response.headers.get('Retry-After');
      let waitMs = currentDelay + Math.random() * 200; // ジッターを付加
      if (retryAfterHeader) {
        const retryAfterSeconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(retryAfterSeconds)) {
          waitMs = retryAfterSeconds * 1000;
        }
      }

      console.warn(`[Google Sheets API] ステータス ${response.status} を検知。リトライ試行 ${attempt + 1}/${maxRetries} (${Math.round(waitMs)}ms後)...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      attempt++;
      currentDelay *= 2; // 指数関数的に待機時間を増加
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      const waitMs = currentDelay + Math.random() * 200;
      console.warn(`[Google Sheets API] 通信例外を検知: ${error}。リトライ試行 ${attempt + 1}/${maxRetries} (${Math.round(waitMs)}ms後)...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt++;
      currentDelay *= 2;
    }
  }
}

/**
 * スプレッドシートIDをサニタイズ（URLが渡された場合でもID部分を抽出）
 */
function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Googleスプレッドシートから全参加者情報を取得
 */
export async function fetchAllParticipants(env: EnvironmentVariables): Promise<Participant[]> {
  const token = await getGoogleAccessToken(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    env.GOOGLE_PRIVATE_KEY
  );

  const sheetName = env.GOOGLE_SHEET_NAME || '参加者情報一覧';
  const spreadsheetId = extractSpreadsheetId(env.GOOGLE_SPREADSHEET_ID);
  const range = encodeURIComponent(`'${sheetName}'!A2:X`); // ヘッダー行を除く全24列（A〜X）

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`;

  const response = await fetchWithExponentialBackoff(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`スプレッドシートの取得に失敗しました (${response.status}): ${errorBody}`);
  }

  const result = (await response.json()) as { values?: (string | boolean)[][] };
  const rows = result.values || [];

  return rows.map((row, index) => {
    const rowIndex = index + 2; // スプレッドシートの行番号（2行目スタート）
    const parseBoolean = (value: unknown): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toUpperCase();
        return normalized === 'TRUE' || normalized === '1' || normalized === 'はい' || normalized === '済';
      }
      return false;
    };

    const bentoConfirmed = parseBoolean(row[22]); // [23] W列: 弁当券引換確認
    const feeConfirmed = parseBoolean(row[23]); // [24] X列: 参加費支払確認（当日受領）

    return {
      id: String(row[0] || '').trim(),
      organization: String(row[1] || '').trim(),
      lastName: String(row[2] || '').trim(),
      firstName: String(row[3] || '').trim(),
      lastNameKana: String(row[4] || '').trim(),
      firstNameKana: String(row[5] || '').trim(),
      phone1: String(row[6] || '').trim(),
      phone2: String(row[7] || '').trim(),
      phone3: String(row[8] || '').trim(),
      email: String(row[9] || '').trim(),
      position: String(row[10] || '').trim(),
      transportation: String(row[11] || '').trim(),
      desiredGrade: String(row[12] || '').trim(),
      subcommittee1: String(row[13] || '').trim(),
      subcommittee2: String(row[14] || '').trim(),
      notes: String(row[15] || '').trim(),
      location: String(row[16] || '').trim(),
      checkedIn: parseBoolean(row[17]), // [18] R列: 受付状況
      bentoOrdered: parseBoolean(row[18]), // [19] S列: 弁当事前注文有無
      feePaid: parseBoolean(row[19]), // [20] T列: 参加費事前支払（変更不可）
      isWalkin: parseBoolean(row[20]), // [21] U列: 当日受付
      updatedAt: String(row[21] || '').trim(), // [22] V列: 最終更新日時
      bentoConfirmed, // [23] W列: 弁当券引換確認
      bentoExchanged: bentoConfirmed, // 互換用プロパティ
      feeConfirmed, // [24] X列: 参加費支払確認
      rowIndex,
    };
  });
}

/**
 * 参加者の受付ステータス（受付・弁当券引換確認・参加費支払確認・更新日時）を更新
 * ※ T列（参加費事前支払）は変更せずそのまま維持
 */
export async function updateParticipantStatus(
  env: EnvironmentVariables,
  payload: UpdateStatusRequest
): Promise<{ id: string; checkedIn?: boolean; bentoOrdered?: boolean; bentoConfirmed?: boolean; feePaid?: boolean; feeConfirmed?: boolean; updatedAt: string }> {
  const token = await getGoogleAccessToken(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    env.GOOGLE_PRIVATE_KEY
  );

  const sheetName = env.GOOGLE_SHEET_NAME || '参加者情報一覧';
  const spreadsheetId = extractSpreadsheetId(env.GOOGLE_SPREADSHEET_ID);

  let targetRowIndex = payload.rowIndex;

  // rowIndexが指定されていない、または検証が必要な場合はIDから行を特定
  if (!targetRowIndex || targetRowIndex < 2) {
    const participants = await fetchAllParticipants(env);
    const matched = participants.find((item) => item.id === payload.id);
    if (!matched || !matched.rowIndex) {
      throw new Error(`システムID: ${payload.id} の参加者が見つかりませんでした。`);
    }
    targetRowIndex = matched.rowIndex;
  }

  const updatedAt = getJstTimestamp();

  // 現在の行の値を取得して指定されたフラグのみを上書き、または直接更新
  // R列(18):受付状況, S列(19):弁当事前注文(維持), T列(20):参加費事前支払(維持), U列(21):当日受付(維持), V列(22):最終更新日時, W列(23):弁当券引換確認, X列(24):参加費支払確認
  const rangeRead = `'${sheetName}'!R${targetRowIndex}:X${targetRowIndex}`;
  const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeRead)}?valueRenderOption=UNFORMATTED_VALUE`;
  
  const readResponse = await fetchWithExponentialBackoff(readUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const parseBooleanVal = (val: unknown): boolean => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const normalized = val.trim().toUpperCase();
      return normalized === 'TRUE' || normalized === '1' || normalized === 'はい' || normalized === '済';
    }
    return false;
  };

  let currentCheckedIn = false;
  let currentBentoOrdered = false;
  let currentFeePaid = false;
  let currentWalkin = false;
  let currentBentoConfirmed = false;
  let currentFeeConfirmed = false;

  if (readResponse.ok) {
    const readResult = (await readResponse.json()) as { values?: unknown[][] };
    const rowValues = readResult.values?.[0] || [];
    currentCheckedIn = parseBooleanVal(rowValues[0]); // R
    currentBentoOrdered = parseBooleanVal(rowValues[1]); // S
    currentFeePaid = parseBooleanVal(rowValues[2]); // T (事前支払: 変更しない)
    currentWalkin = parseBooleanVal(rowValues[3]); // U
    currentBentoConfirmed = parseBooleanVal(rowValues[5]); // W (弁当券引換確認)
    currentFeeConfirmed = parseBooleanVal(rowValues[6]); // X (参加費支払確認)
  }

  const finalCheckedIn = payload.checkedIn !== undefined ? payload.checkedIn : currentCheckedIn;
  const requestedBentoConfirmed = payload.bentoConfirmed !== undefined ? payload.bentoConfirmed : payload.bentoExchanged;
  const finalBentoConfirmed = requestedBentoConfirmed !== undefined ? requestedBentoConfirmed : currentBentoConfirmed;
  const finalFeeConfirmed = payload.feeConfirmed !== undefined ? payload.feeConfirmed : currentFeeConfirmed;

  const rangeWrite = `'${sheetName}'!R${targetRowIndex}:X${targetRowIndex}`;
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeWrite)}?valueInputOption=USER_ENTERED`;

  const bodyData = {
    range: rangeWrite,
    majorDimension: 'ROWS',
    values: [
      [
        finalCheckedIn ? 'TRUE' : 'FALSE', // R: 受付状況
        currentBentoOrdered ? 'TRUE' : 'FALSE', // S: 弁当事前注文 (維持)
        currentFeePaid ? 'TRUE' : 'FALSE', // T: 参加費事前支払 (変更せず維持)
        currentWalkin ? 'TRUE' : 'FALSE', // U: 当日受付 (維持)
        updatedAt, // V: 最終更新日時
        finalBentoConfirmed ? 'TRUE' : 'FALSE', // W: 弁当券引換確認
        finalFeeConfirmed ? 'TRUE' : 'FALSE', // X: 参加費支払確認 (当日受領)
      ],
    ],
  };

  const updateResponse = await fetchWithExponentialBackoff(updateUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyData),
  });

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text();
    throw new Error(`ステータス更新に失敗しました (${updateResponse.status}): ${errorBody}`);
  }

  return {
    id: payload.id,
    checkedIn: finalCheckedIn,
    bentoOrdered: currentBentoOrdered,
    bentoConfirmed: finalBentoConfirmed,
    feePaid: currentFeePaid,
    feeConfirmed: finalFeeConfirmed,
    updatedAt,
  };
}

/**
 * 当日参加者をスプレッドシートの末尾に新規登録
 */
export async function appendWalkinParticipant(
  env: EnvironmentVariables,
  payload: WalkinRegistrationRequest
): Promise<Participant> {
  const token = await getGoogleAccessToken(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    env.GOOGLE_PRIVATE_KEY
  );

  const sheetName = env.GOOGLE_SHEET_NAME || '参加者情報一覧';
  const spreadsheetId = extractSpreadsheetId(env.GOOGLE_SPREADSHEET_ID);

  // システムID（UUID v4）の自動採番
  const generatedId = crypto.randomUUID();
  const timestamp = getJstTimestamp();

  const newParticipant: Participant = {
    id: generatedId,
    organization: payload.organization || '',
    lastName: payload.lastName || '',
    firstName: payload.firstName || '',
    lastNameKana: payload.lastNameKana || '',
    firstNameKana: payload.firstNameKana || '',
    phone1: payload.phone1 || '',
    phone2: payload.phone2 || '',
    phone3: payload.phone3 || '',
    email: payload.email || '',
    position: payload.position || '',
    transportation: payload.transportation || '',
    desiredGrade: payload.desiredGrade || '',
    subcommittee1: payload.subcommittee1 || '',
    subcommittee2: payload.subcommittee2 || '',
    notes: payload.notes || '',
    location: payload.location || '',
    checkedIn: payload.checkedIn !== undefined ? payload.checkedIn : true, // 当日登録はデフォルトで受付済
    bentoOrdered: payload.bentoOrdered || false,
    feePaid: payload.feePaid || false,
    isWalkin: true, // 当日受付フラグは必ずTRUE
    updatedAt: timestamp,
    bentoConfirmed: payload.bentoConfirmed || false,
    bentoExchanged: payload.bentoConfirmed || false,
    feeConfirmed: payload.feeConfirmed || false,
  };

  // 24列の配列データを作成（A〜X）
  const rowValues = [
    newParticipant.id, // A [1]
    newParticipant.organization, // B [2]
    newParticipant.lastName, // C [3]
    newParticipant.firstName, // D [4]
    newParticipant.lastNameKana, // E [5]
    newParticipant.firstNameKana, // F [6]
    newParticipant.phone1, // G [7]
    newParticipant.phone2, // H [8]
    newParticipant.phone3, // I [9]
    newParticipant.email, // J [10]
    newParticipant.position, // K [11]
    newParticipant.transportation, // L [12]
    newParticipant.desiredGrade, // M [13]
    newParticipant.subcommittee1, // N [14]
    newParticipant.subcommittee2, // O [15]
    newParticipant.notes, // P [16]
    newParticipant.location, // Q [17]
    newParticipant.checkedIn ? 'TRUE' : 'FALSE', // R [18]
    newParticipant.bentoOrdered ? 'TRUE' : 'FALSE', // S [19]
    newParticipant.feePaid ? 'TRUE' : 'FALSE', // T [20]
    'TRUE', // U [21]
    newParticipant.updatedAt, // V [22]
    newParticipant.bentoConfirmed ? 'TRUE' : 'FALSE', // W [23]
    newParticipant.feeConfirmed ? 'TRUE' : 'FALSE', // X [24]
  ];

  const targetAppendRange = `'${sheetName}'!A:X`;
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetAppendRange)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetchWithExponentialBackoff(appendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: targetAppendRange,
      majorDimension: 'ROWS',
      values: [rowValues],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`当日参加者データの追加に失敗しました (${response.status}): ${errorBody}`);
  }

  return newParticipant;
}
