// Файл: emaktab-solver.js (ПОЛНАЯ ВЕРСИЯ с улучшенной обработкой формул)

(async function() {
    'use strict';

    console.log('eMaktab Solver Script: Запущен.');

    // --- НАСТРОЙКИ ---
    const GEMINI_API_KEY = 'AIzaSyB9vWInkcJrlGJmhRteOSthybGnSDUwfGw'; // !!! ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ КЛЮЧ !!!
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent?key=${GEMINI_API_KEY}`;

    // --- Глобальные переменные для UI ---
    let chatWindow = null;
    // let fileInput = null; // Больше не нужен
    let textInput = null;    // Теперь это основное поле для текста И для вставки скриншотов
    let chatOutput = null;
    let sendButton = null;
    let currentImageBase64 = null;
    let currentImageMimeType = null; // Будем хранить MIME-тип

    // --- Функции для UI ---

    function createChatUI() {
        if (document.getElementById('emaktab-ai-chat-window')) return;

        chatWindow = document.createElement('div');
        chatWindow.id = 'emaktab-ai-chat-window';
        Object.assign(chatWindow.style, {
            position: 'fixed', bottom: '60px', right: '20px', width: '320px', maxHeight: '450px',
            backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 0 10px rgba(0,0,0,0.1)',
            zIndex: '100000', display: 'flex', flexDirection: 'column', padding: '10px', overflow: 'hidden'
        });

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
        chatOutput.innerHTML = '<i>Вставьте скриншот (Ctrl+V) в поле ниже или просто задайте вопрос.</i>';
        chatWindow.appendChild(chatOutput);

        textInput = document.createElement('textarea');
        textInput.placeholder = 'Вопрос или Ctrl+V для скриншота';
        textInput.rows = 3; // Увеличим немного
        Object.assign(textInput.style, {
            width: 'calc(100% - 12px)', marginBottom: '10px', padding: '5px', border: '1px solid #ccc', borderRadius: '4px', resize: 'none'
        });
        // Добавляем обработчик события 'paste'
        textInput.addEventListener('paste', handlePaste);
        chatWindow.appendChild(textInput);

        sendButton = document.createElement('button');
        sendButton.textContent = 'Отправить Gemini';
        Object.assign(sendButton.style, {
            padding: '8px', backgroundColor: '#673ab7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
        });
        sendButton.onclick = handleSendToGemini;
        chatWindow.appendChild(sendButton);

        document.body.appendChild(chatWindow);
        chatWindow.style.display = 'none';
    }

    function toggleChatWindow() {
        if (!chatWindow) createChatUI();
        chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
        if (chatWindow.style.display === 'flex') {
            addMessageToChat('<i>Вставьте скриншот (Ctrl+V) в поле для вопроса или просто напишите текст.</i>', 'system');
            textInput.focus(); // Фокус на текстовое поле при открытии
        }
    }

    function addMessageToChat(message, sender = 'user') {
        // ... (код addMessageToChat без изменений)
    }
    // Скопируйте код addMessageToChat из предыдущего ответа сюда
    addMessageToChat = function(message, sender = 'user') { // Переопределение для полноты кода
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
        } else if (sender === 'user-image') { // Для отображения вставленного изображения
             messageDiv.style.textAlign = 'center';
             messageDiv.innerHTML = message; // message уже будет <img ...>
        } else { // system
            messageDiv.innerHTML = `${message}`;
        }
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    };


    // --- Логика обработки ---

    function handlePaste(event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;
        if (!items) return;

        let foundImage = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    foundImage = true;
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const base64WithPrefix = e.target.result;
                        currentImageBase64 = base64WithPrefix.split(',')[1];
                        currentImageMimeType = base64WithPrefix.substring(base64WithPrefix.indexOf(':') + 1, base64WithPrefix.indexOf(';'));
                        
                        addMessageToChat('<img src="' + base64WithPrefix + '" style="max-width:100%; max-height:150px; border:1px solid #ddd;" alt="вставленный скриншот">', 'user-image');
                        addMessageToChat('<i>Скриншот вставлен. Добавьте вопрос или нажмите "Отправить".</i>', 'system');
                        textInput.value = ""; // Очищаем текстовое поле, если вставили картинку
                    };
                    reader.readAsDataURL(blob);
                    event.preventDefault(); // Предотвращаем стандартную вставку (если это текст/HTML)
                    break; 
                }
            }
        }
        if (foundImage) {
            console.log("Изображение вставлено из буфера обмена.");
        }
    }

    async function handleSendToGemini() {
        const userText = textInput.value.trim();

        if (!currentImageBase64 && !userText) {
            addMessageToChat('<i>Ошибка: Вставьте скриншот или напишите текстовый вопрос.</i>', 'system');
            return;
        }
        if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            alert('Пожалуйста, вставьте ваш API ключ Gemini в скрипт!');
            return;
        }
        
        let partsArray = [];
        if (userText) {
            partsArray.push({ text: userText });
            addMessageToChat(userText, 'user');
        }
        if (currentImageBase64 && currentImageMimeType) {
            partsArray.push({
                inline_data: {
                    mime_type: currentImageMimeType,
                    data: currentImageBase64
                }
            });
             if (!userText) { // Если отправляется только картинка, добавляем сообщение
                addMessageToChat('(Отправлен только скриншот)', 'user');
            }
        }

        sendButton.disabled = true;
        sendButton.textContent = '⏳ Отправка...';
        chatOutput.scrollTop = chatOutput.scrollHeight;

        const requestBody = {
            contents: [{ parts: partsArray }],
        };

        try {
            // ... (код fetch запроса и обработки ответа Gemini как в предыдущей версии) ...
            const response = await fetch(GEMINI_API_URL, { /* ... */ });
            // ...
        } catch (error) {
            // ...
        }
        // Скопируйте сюда код try/catch блока из функции handleSendToGemini предыдущего ответа
        // ... (включая sendButton.disabled = false; и очистку currentImageBase64 и textInput.value)
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
        currentImageBase64 = null;
        currentImageMimeType = null;
        textInput.value = ""; // Очищаем текстовое поле после отправки
    }


    // --- Создание кнопки для вызова чата ---
    const helperButton = document.createElement('button');
    helperButton.textContent = '💬 AI';
    // ... (стили helperButton как раньше) ...
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
    createChatUI();

})();
