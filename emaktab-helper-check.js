// Файл: emaktab-solver.js (ПОЛНАЯ ВЕРСИЯ с улучшенной обработкой формул)

(async function() {
    'use strict';

    console.log('eMaktab Solver Script: Запущен.');

    // --- НАСТРОЙКИ ---
    const GEMINI_API_KEY = 'AIzaSyB9vWInkcJrlGJmhRteOSthybGnSDUwfGw'; // !!! ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ КЛЮЧ !!!
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent?key=${GEMINI_API_KEY}`;

    // --- Глобальные переменные для UI ---
    let chatWindow = null;
    let fileInput = null;
    let textInput = null;
    let chatOutput = null;
    let sendButton = null;
    let currentImageBase64 = null;

    // --- Функции для UI ---

    function createChatUI() {
        if (document.getElementById('emaktab-ai-chat-window')) return; // Уже создан

        chatWindow = document.createElement('div');
        chatWindow.id = 'emaktab-ai-chat-window';
        // Стили для окна чата (сделайте его маленьким и аккуратным)
        Object.assign(chatWindow.style, {
            position: 'fixed', bottom: '60px', right: '20px', width: '300px', maxHeight: '400px',
            backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 0 10px rgba(0,0,0,0.1)',
            zIndex: '100000', display: 'flex', flexDirection: 'column', padding: '10px', overflow: 'hidden'
        });

        // Кнопка закрытия
        const closeButton = document.createElement('button');
        closeButton.textContent = '✖';
        Object.assign(closeButton.style, {
            position: 'absolute', top: '5px', right: '5px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px'
        });
        closeButton.onclick = () => chatWindow.style.display = 'none';
        chatWindow.appendChild(closeButton);

        chatOutput = document.createElement('div');
        Object.assign(chatOutput.style, {
            flexGrow: '1', overflowY: 'auto', marginBottom: '10px', border: '1px solid #eee', padding: '5px', fontSize: '12px'
        });
        chatOutput.innerHTML = '<i>Загрузите скриншот и задайте вопрос.</i>';
        chatWindow.appendChild(chatOutput);

        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.marginBottom = '5px';
        fileInput.onchange = handleFileSelect;
        chatWindow.appendChild(fileInput);

        textInput = document.createElement('textarea');
        textInput.placeholder = 'Ваш вопрос к скриншоту (необязательно)';
        textInput.rows = 2;
        Object.assign(textInput.style, {
            width: 'calc(100% - 10px)', marginBottom: '5px', padding: '5px', border: '1px solid #ccc', borderRadius: '4px'
        });
        chatWindow.appendChild(textInput);

        sendButton = document.createElement('button');
        sendButton.textContent = 'Отправить Gemini';
        Object.assign(sendButton.style, {
            padding: '8px', backgroundColor: '#673ab7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
        });
        sendButton.onclick = handleSendToGemini;
        chatWindow.appendChild(sendButton);

        document.body.appendChild(chatWindow);
        chatWindow.style.display = 'none'; // Сначала скрыт
    }

    function toggleChatWindow() {
        if (!chatWindow) createChatUI();
        chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
        if (chatWindow.style.display === 'flex') {
            addMessageToChat('<i>Ожидание скриншота...</i>', 'system');
        }
    }

    function addMessageToChat(message, sender = 'user') {
        if (!chatOutput) return;
        const messageDiv = document.createElement('div');
        messageDiv.style.marginBottom = '5px';
        messageDiv.style.padding = '3px';
        messageDiv.style.borderRadius = '3px';
        if (sender === 'gemini') {
            messageDiv.style.backgroundColor = '#e1f5fe';
            messageDiv.innerHTML = `<b>Gemini:</b> ${message.replace(/\n/g, '<br>')}`;
        } else if (sender === 'user') {
            messageDiv.style.backgroundColor = '#f0f0f0';
            messageDiv.innerHTML = `<b>Вы:</b> ${message}`;
        } else { // system
            messageDiv.innerHTML = `${message}`;
        }
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight; // Прокрутка вниз
    }

    // --- Логика обработки ---

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentImageBase64 = e.target.result.split(',')[1]; // Получаем только Base64 данные
                addMessageToChat('<img src="' + e.target.result + '" style="max-width:100%; max-height:150px;" alt="скриншот">', 'user-image');
                addMessageToChat('<i>Скриншот загружен. Введите вопрос или нажмите "Отправить".</i>', 'system');
            }
            reader.readAsDataURL(file);
        } else {
            currentImageBase64 = null;
            addMessageToChat('<i>Ошибка: Пожалуйста, выберите файл изображения.</i>', 'system');
        }
    }

    async function handleSendToGemini() {
        if (!currentImageBase64) {
            addMessageToChat('<i>Ошибка: Сначала загрузите скриншот.</i>', 'system');
            return;
        }
        if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            alert('Пожалуйста, вставьте ваш API ключ Gemini в скрипт!');
            return;
        }

        const userText = textInput.value.trim();
        let promptForGemini = "Проанализируй это изображение.";
        if (userText) {
            promptForGemini = userText + "\n\nКонтекст изображения ниже:";
        }
        
        addMessageToChat(userText || '(Отправлен только скриншот)', 'user');
        sendButton.disabled = true;
        sendButton.textContent = '⏳ Отправка...';
        chatOutput.scrollTop = chatOutput.scrollHeight;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: promptForGemini },
                        {
                            inline_data: {
                                mime_type: "image/png", // Или image/jpeg, в зависимости от скриншота
                                data: currentImageBase64
                            }
                        }
                    ]
                }
            ],
            // generationConfig: { temperature: 0.4, maxOutputTokens: 1024 } // Можно настроить
        };

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            sendButton.disabled = false;
            sendButton.textContent = 'Отправить Gemini';

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Gemini API Error:', response.status, errorData);
                const detailedError = errorData?.error?.message || JSON.stringify(errorData);
                addMessageToChat(`ОШИБКА API ${response.status}: ${detailedError}`, 'gemini');
                return;
            }

            const data = await response.json();
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]) {
                const geminiResponseText = data.candidates[0].content.parts[0].text.trim();
                addMessageToChat(geminiResponseText, 'gemini');
            } else if (data.promptFeedback && data.promptFeedback.blockReason) {
                addMessageToChat(`ЗАПРОС ЗАБЛОКИРОВАН: ${data.promptFeedback.blockReason}`, 'gemini');
            } else {
                addMessageToChat('Нет ответа от Gemini или некорректный формат.', 'gemini');
            }
        } catch (error) {
            console.error('Ошибка при запросе к Gemini API:', error);
            sendButton.disabled = false;
            sendButton.textContent = 'Отправить Gemini';
            addMessageToChat(`Сетевая ошибка: ${error.message}`, 'gemini');
        }
        // Очистка для следующего запроса
        currentImageBase64 = null;
        fileInput.value = ""; // Сбрасываем input file
        textInput.value = "";
    }


    // --- Создание кнопки для вызова чата ---
    const helperButton = document.createElement('button');
    helperButton.textContent = '💬 AI';
    Object.assign(helperButton.style, {
        position: 'fixed', bottom: '20px', right: '20px', zIndex: '99998',
        padding: '8px 12px', backgroundColor: '#007bff', color: 'white',
        border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '14px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
    });
    helperButton.id = 'emaktab-ai-helper-button';
    helperButton.onclick = toggleChatWindow;

    if (!document.getElementById('emaktab-ai-helper-button')) {
        document.body.appendChild(helperButton);
    }
    // Первоначальное создание UI чата (скрытого)
    createChatUI();

})();
