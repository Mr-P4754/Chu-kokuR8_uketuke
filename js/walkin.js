/**
 * 当日参加者受付フォーム (walkin.html) 制御スクリプト
 */

document.addEventListener('DOMContentLoaded', () => {
  const formElement = document.getElementById('walkinForm');
  const submitButton = document.getElementById('submitButton');
  const buttonSpinner = document.getElementById('buttonSpinner');
  const buttonText = document.getElementById('buttonText');
  const alertContainer = document.getElementById('alertContainer');
  const formSection = document.getElementById('formSection');
  const completionSection = document.getElementById('completionSection');
  const registeredNameSpan = document.getElementById('registeredName');
  const registeredIdSpan = document.getElementById('registeredId');
  const resetFormButton = document.getElementById('resetFormButton');

  /**
   * エラー・成功アラートメッセージの表示
   */
  function showAlert(message, type = 'error') {
    if (!alertContainer) return;

    const isError = type === 'error';
    alertContainer.className = `p-4 rounded-xl mb-6 text-sm font-medium flex items-start gap-3 animate-fade-in ${
      isError ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
    }`;

    alertContainer.innerHTML = `
      <svg class="w-5 h-5 flex-shrink-0 mt-0.5 ${isError ? 'text-rose-500' : 'text-emerald-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        ${isError 
          ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />'
          : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />'
        }
      </svg>
      <div class="flex-1">${message}</div>
    `;
    alertContainer.classList.remove('hidden');

    // 画面上部へスムーズスクロール
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * アラートの非表示
   */
  function clearAlert() {
    if (!alertContainer) return;
    alertContainer.classList.add('hidden');
    alertContainer.innerHTML = '';
  }

  /**
   * ボタン送信中状態の切り替え
   */
  function setSubmittingState(isSubmitting) {
    if (!submitButton) return;
    submitButton.disabled = isSubmitting;
    if (isSubmitting) {
      submitButton.classList.add('opacity-75', 'cursor-not-allowed');
      buttonSpinner?.classList.remove('hidden');
      if (buttonText) buttonText.textContent = '登録処理中...';
    } else {
      submitButton.classList.remove('opacity-75', 'cursor-not-allowed');
      buttonSpinner?.classList.add('hidden');
      if (buttonText) buttonText.textContent = '当日参加を受付する';
    }
  }

  /**
   * フリガナのひらがな→カタカナ変換補助
   */
  function convertHiraganaToKatakana(inputString) {
    return inputString.replace(/[\u3041-\u3096]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) + 0x60);
    });
  }

  // フリガナ入力欄でフォーカスが外れた際に自動でカタカナに補正
  const lastNameKanaInput = document.getElementById('lastNameKana');
  const firstNameKanaInput = document.getElementById('firstNameKana');

  lastNameKanaInput?.addEventListener('blur', (event) => {
    const target = event.target;
    if (target) {
      target.value = convertHiraganaToKatakana(target.value.trim());
    }
  });

  firstNameKanaInput?.addEventListener('blur', (event) => {
    const target = event.target;
    if (target) {
      target.value = convertHiraganaToKatakana(target.value.trim());
    }
  });

  // 電話番号の自動フォーカス移動
  const phone1Input = document.getElementById('phone1');
  const phone2Input = document.getElementById('phone2');
  const phone3Input = document.getElementById('phone3');

  phone1Input?.addEventListener('input', (event) => {
    if (event.target.value.length >= 3) phone2Input?.focus();
  });
  phone2Input?.addEventListener('input', (event) => {
    if (event.target.value.length >= 4) phone3Input?.focus();
  });

  /**
   * フォーム送信ハンドラー
   */
  formElement?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert();

    const formData = new FormData(formElement);
    const lastName = String(formData.get('lastName') || '').trim();
    const firstName = String(formData.get('firstName') || '').trim();
    const lastNameKana = convertHiraganaToKatakana(String(formData.get('lastNameKana') || '').trim());
    const firstNameKana = convertHiraganaToKatakana(String(formData.get('firstNameKana') || '').trim());
    const organization = String(formData.get('organization') || '').trim();
    const position = String(formData.get('position') || '').trim();
    const phone1 = String(formData.get('phone1') || '').trim();
    const phone2 = String(formData.get('phone2') || '').trim();
    const phone3 = String(formData.get('phone3') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const location = String(formData.get('location') || '').trim();
    const transportation = String(formData.get('transportation') || '').trim();
    const desiredGrade = String(formData.get('desiredGrade') || '').trim();
    const subcommittee1 = String(formData.get('subcommittee1') || '').trim();
    const subcommittee2 = String(formData.get('subcommittee2') || '').trim();
    const notes = String(formData.get('notes') || '').trim();

    // クライアント側バリデーション
    if (!lastName || !firstName) {
      showAlert('お名前（姓・名）を入力してください。');
      return;
    }
    if (!lastNameKana || !firstNameKana) {
      showAlert('お名前のフリガナ（セイ・メイ）を入力してください。');
      return;
    }
    if (!organization) {
      showAlert('ご所属（法人・学校・団体名）を入力してください。');
      return;
    }

    const payload = {
      organization,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      phone1,
      phone2,
      phone3,
      email,
      position,
      transportation,
      desiredGrade,
      subcommittee1,
      subcommittee2,
      notes,
      location,
      checkedIn: true, // 当日受付完了として登録
      bentoExchanged: false,
      feePaid: false,
    };

    setSubmittingState(true);

    try {
      const baseUrl = window.AppConfig?.apiBaseUrl || '';
      const response = await fetch(`${baseUrl}/api/walkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '登録処理に失敗しました。受付スタッフにお声がけください。');
      }

      // 登録完了画面への切り替え
      if (formSection && completionSection) {
        formSection.classList.add('hidden');
        completionSection.classList.remove('hidden');

        if (registeredNameSpan) {
          registeredNameSpan.textContent = `${lastName} ${firstName}`;
        }
        if (registeredIdSpan && result.data?.id) {
          registeredIdSpan.textContent = result.data.id.substring(0, 8).toUpperCase();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '通信エラーが発生しました。電波状況をご確認ください。';
      showAlert(message);
    } finally {
      setSubmittingState(false);
    }
  });

  /**
   * 別の参加者を登録するボタン
   */
  resetFormButton?.addEventListener('click', () => {
    formElement?.reset();
    clearAlert();
    if (formSection && completionSection) {
      completionSection.classList.add('hidden');
      formSection.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
});
