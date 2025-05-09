// Файл: emaktab-solver.js
// Поместите этот файл в ваш GitHub репозиторий

(async function() {
    'use strict';

    console.log('eMaktab Solver Script: Запущен.');

    // --- НАСТРОЙКИ ---
    const GEMINI_API_KEY = 'AIzaSyB9vWInkcJrlGJmhRteOSthybGnSDUwfGw'; // !!! ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЙ КЛЮЧ !!!
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

    // --- Селекторы (на основе нашего анализа) ---
    const QUESTION_BLOCK_SELECTOR = '[data-test-id^="block-"]';
    const LEXICAL_EDITOR_SELECTOR = 'div[data-lexical-editor="true"]';
    const PARAGRAPH_SELECTOR = 'p';
    const TEXT_SPAN_SELECTOR = 'span[data-lexical-text="true"]:not(:empty)';

    const TABLE_SELECTOR_IN_BLOCK = 'table';
    const ANSWER_INPUT_SELECTOR = 'input[data-test-id^="answer-"]';

    const DECORATOR_SPAN_WITH_INPUT_SELECTOR_QUERY = `span[data-lexical-decorator="true"]:has(${ANSWER_INPUT_SELECTOR})`;
    const DECORATOR_SPAN_SELECTOR = 'span[data-lexical-decorator="true"]';

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    /**
     * Отправляет запрос нейросети Gemini.
     * @param {string} fullPrompt - Полный текст промпта для Gemini.
     * @returns {Promise<string>} Ответ от Gemini.
     */
    async function askGemini(fullPrompt) {
        console.log("Промпт для Gemini:", fullPrompt);
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    // generationConfig: { "temperature": 0.7, "maxOutputTokens": 800 } // Можно настроить
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Gemini API Error:', response.status, errorData);
                const detailedError = errorData?.error?.message || JSON.stringify(errorData);
                return `ОШИБКА API ${response.status}: ${detailedError}`;
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0) {
                return data.candidates[0].content.parts[0].text.trim();
            } else if (data.promptFeedback && data.promptFeedback.blockReason) {
                console.warn('Gemini API: Запрос заблокирован.', data.promptFeedback);
                return `ЗАПРОС ЗАБЛОКИРОВАН: ${data.promptFeedback.blockReason}`;
            } else {
                console.warn('Gemini API: Некорректный формат ответа.', data);
                return 'Нет ответа от Gemini';
            }
        } catch (error) {
            console.error('Ошибка при запросе к Gemini API:', error);
            return `Сетевая ошибка Gemini: ${error.message}`;
        }
    }

    /**
     * Отображает предложенный ответ на странице.
     * @param {HTMLElement} questionBlockElement - HTML-элемент блока вопроса.
     * @param {string} geminiAnswer - Ответ от Gemini.
     * @param {Array} answerInputsData - Массив данных о полях ввода (для попытки автозаполнения)
     */
    function displayAnswer(questionBlockElement, geminiAnswer, answerInputsData = []) {
        const existingDisplay = questionBlockElement.querySelector('.gemini-answer-display');
        if (existingDisplay) {
            existingDisplay.remove();
        }

        const answerDisplay = document.createElement('div');
        answerDisplay.className = 'gemini-answer-display';
        answerDisplay.style.marginTop = '15px';
        answerDisplay.style.padding = '10px';
        answerDisplay.style.border = '1px dashed blue';
        answerDisplay.style.backgroundColor = '#f0f8ff';
        answerDisplay.style.whiteSpace = 'pre-wrap'; // Чтобы сохранять переносы строк от Gemini
        answerDisplay.innerHTML = `<strong>🤖 Gemini:</strong><br>${geminiAnswer.replace(/\n/g, '<br>')}`;
        
        // Вставляем после всего контента редактора Lexical
        const lexicalEditor = questionBlockElement.querySelector(LEXICAL_EDITOR_SELECTOR);
        if (lexicalEditor) {
            lexicalEditor.insertAdjacentElement('afterend', answerDisplay);
        } else {
            questionBlockElement.appendChild(answerDisplay);
        }

        // Попытка автозаполнения (очень базовая, нужно улучшать)
        if (answerInputsData.length > 0 && geminiAnswer) {
            const lines = geminiAnswer.split('\n');
            lines.forEach(line => {
                // Ищем строки вида "answer-X: значение" или "[INPUT answer-X]: значение"
                const match = line.match(/(?:answer-|INPUT\s+)([a-zA-Z0-9_-]+)\s*:\s*(.*)/i);
                if (match) {
                    const dataTestId = "answer-" + match[1].replace(/^answer-/i, ''); // Убедимся, что dataTestId начинается с "answer-"
                    const valueToInsert = match[2].trim();
                    const inputElement = questionBlockElement.querySelector(`input[data-test-id="${dataTestId}"]`);
                    if (inputElement) {
                        console.log(`Попытка вставить "${valueToInsert}" в input[data-test-id="${dataTestId}"]`);
                        inputElement.value = valueToInsert;
                        // Можно добавить подсветку или другие индикаторы
                        inputElement.style.backgroundColor = 'lightyellow';
                    } else {
                        console.warn(`Не найден input для data-test-id="${dataTestId}" для вставки значения.`);
                    }
                }
            });
        }
    }


    /**
     * Извлекает основной текст вопроса из блока.
     * @param {HTMLElement} block - HTML-элемент блока вопроса.
     * @returns {string} Текст вопроса.
     */
    function extractMainQuestionText(block) {
        const lexicalEditor = block.querySelector(LEXICAL_EDITOR_SELECTOR);
        if (!lexicalEditor) return "";

        let mainQuestionSegments = [];
        const paragraphs = lexicalEditor.querySelectorAll(PARAGRAPH_SELECTOR);

        for (const p of paragraphs) {
            if (p.querySelector(ANSWER_INPUT_SELECTOR) ||
                (p.innerText.trim().startsWith("Ответ:") && p.querySelector(DECORATOR_SPAN_SELECTOR)) ||
                (/^\d+\)/.test(p.innerText.trim()) && p.querySelector(DECORATOR_SPAN_SELECTOR))
               ) {
                break; 
            }
            const textSpans = p.querySelectorAll(TEXT_SPAN_SELECTOR);
            textSpans.forEach(span => mainQuestionSegments.push(span.innerText.trim()));
        }
        return mainQuestionSegments.join(" ").trim();
    }

    /**
     * Формирует промпт для Gemini на основе данных вопроса.
     * @param {string} mainQuestionText - Основной текст вопроса.
     * @param {object|null} tableData - Данные таблицы или null.
     * @param {Array} nonTableInputsData - Данные нетабличных полей ввода.
     * @returns {string} Промпт для Gemini.
     */
    function buildPrompt(mainQuestionText, tableData, nonTableInputsData) {
        let prompt = `Проанализируй следующий вопрос и предоставь ответы.
Если это таблица, заполни ячейки, помеченные как [МЕСТО ДЛЯ ОТВЕТА] или [INPUT ...].
Если это список вопросов, дай ответ для каждого пункта.
Ответы давай в формате "answer-X: значение" или "метка: значение", где X - номер из data-test-id.

Основной вопрос:
${mainQuestionText}
\n`;

        if (tableData) {
            prompt += "\nТаблица для заполнения:\n";
            prompt += tableData.headers.join('\t|\t') + '\n';
            prompt += '-'.repeat(tableData.headers.join('\t|\t').length) + '\n';
            tableData.rows.forEach(row => {
                let rowStr = "";
                tableData.headers.forEach(header => {
                    const cellContent = row[header];
                    if (cellContent.type === 'input') {
                        rowStr += `[INPUT ${cellContent.dataTestId}]` + '\t|\t';
                    } else {
                        rowStr += cellContent.value + '\t|\t';
                    }
                });
                prompt += rowStr.slice(0, -3) + '\n'; // Убираем последний ' | '
            });
        } else if (nonTableInputsData.length > 0) {
            prompt += "\nОтветь на следующие пункты:\n";
            nonTableInputsData.forEach(inputData => {
                prompt += `${inputData.context.trim()} [INPUT ${inputData.dataTestId}]\n`;
            });
        }
        return prompt;
    }


    // --- ОСНОВНАЯ ЛОГИКА ---
    async function processQuestionsOnPage() {
        const questionBlocks = document.querySelectorAll(QUESTION_BLOCK_SELECTOR);

        if (questionBlocks.length === 0) {
            console.log('eMaktab Solver: Блоки вопросов не найдены.');
            alert('Блоки вопросов не найдены. Проверьте селекторы в скрипте.');
            return;
        }

        console.log(`eMaktab Solver: Найдено блоков вопросов: ${questionBlocks.length}. Обработка...`);
        solveButton.textContent = `⏳ Обработка (0/${questionBlocks.length})...`;

        let questionCounter = 0;
        for (const block of questionBlocks) {
            questionCounter++;
            const blockId = block.getAttribute('data-test-id');
            console.log(`\n--- Обработка блока #${questionCounter} (data-test-id: ${blockId}) ---`);
            solveButton.textContent = `⏳ Обработка (${questionCounter}/${questionBlocks.length})...`;

            const mainQuestionText = extractMainQuestionText(block);
            if (!mainQuestionText) {
                console.warn(`   Пропускаем блок ${blockId}: не удалось извлечь основной текст вопроса.`);
                continue;
            }

            const tableElement = block.querySelector(TABLE_SELECTOR_IN_BLOCK);
            const answerInputs = Array.from(block.querySelectorAll(ANSWER_INPUT_SELECTOR));
            let tableData = null;
            let nonTableInputsData = [];
            let allInputsForDisplay = []; // Для функции displayAnswer

            if (tableElement) {
                console.log(`   Блок ${blockId} содержит таблицу.`);
                tableData = { headers: [], rows: [] };
                const rows = Array.from(tableElement.querySelectorAll('tr'));
                if (rows.length > 0) {
                    const headerRow = rows[0];
                    const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
                    tableData.headers = headerCells.map(cell => cell.innerText.trim());

                    const dataRows = rows.slice(1);
                    dataRows.forEach(dataRow => {
                        const cells = Array.from(dataRow.querySelectorAll('td'));
                        const rowData = {};
                        let rowHasInput = false;
                        tableData.headers.forEach((header, cellIndex) => {
                            const cell = cells[cellIndex];
                            if (!cell) return;
                            const inputField = cell.querySelector(ANSWER_INPUT_SELECTOR);
                            if (inputField) {
                                rowHasInput = true;
                                const inputInfo = {
                                    type: 'input',
                                    dataTestId: inputField.getAttribute('data-test-id'),
                                    placeholder: inputField.getAttribute('placeholder')
                                };
                                rowData[header] = inputInfo;
                                allInputsForDisplay.push(inputInfo);
                            } else {
                                rowData[header] = { type: 'data', value: cell.innerText.trim() };
                            }
                        });
                        if(rowHasInput || Object.keys(rowData).length > 0) tableData.rows.push(rowData);
                    });
                }
                if(tableData.rows.length === 0 && answerInputs.length > 0 && !answerInputs.some(inp => tableElement.contains(inp))) {
                    // Если в таблице не нашли инпутов, но они есть в блоке вне таблицы
                    tableData = null; // Считаем это не табличным вопросом
                } else if (tableData.rows.length === 0) {
                     console.warn(`   В таблице блока ${blockId} не найдено строк с данными или инпутами.`);
                     tableData = null; // Если таблица пуста или без инпутов, не используем ее для промпта так
                }


            }
            
            if (!tableData && answerInputs.length > 0) {
                console.log(`   Блок ${blockId} обрабатывается как список полей ввода.`);
                const allParagraphsInLexical = Array.from(block.querySelectorAll(`${LEXICAL_EDITOR_SELECTOR} > ${PARAGRAPH_SELECTOR}`));
                
                answerInputs.forEach(inputEl => {
                    const dataTestId = inputEl.getAttribute('data-test-id');
                    let contextText = "";
                    const parentPWithInput = inputEl.closest(PARAGRAPH_SELECTOR);

                    if (parentPWithInput) {
                        let pTextBeforeInput = "";
                        for (const childNode of parentPWithInput.childNodes) {
                            if (childNode.nodeType === Node.ELEMENT_NODE && childNode.matches(DECORATOR_SPAN_WITH_INPUT_SELECTOR_QUERY)) {
                                break;
                            }
                            if (childNode.textContent.trim()) {
                                pTextBeforeInput += childNode.textContent.trim() + " ";
                            }
                        }
                        if (pTextBeforeInput.trim()) {
                            contextText += `${pTextBeforeInput.trim()} `;
                        }

                        const indexOfParentP = allParagraphsInLexical.indexOf(parentPWithInput);
                        if (indexOfParentP > 0) {
                            for (let i = indexOfParentP - 1; i >= 0; i--) {
                                const prevP = allParagraphsInLexical[i];
                                if (prevP.querySelector(ANSWER_INPUT_SELECTOR) || !prevP.innerText.trim() || mainQuestionText.includes(prevP.innerText.trim())) {
                                     break; 
                                }
                                if (!prevP.querySelector(DECORATOR_SPAN_SELECTOR)) {
                                     contextText = `${prevP.innerText.trim()} ` + contextText;
                                     break; 
                                }
                            }
                        }
                    }
                    nonTableInputsData.push({ dataTestId, context: contextText || "(нет явного контекста)" });
                    allInputsForDisplay.push({dataTestId, type: 'input'});
                });
            }

            if (!tableData && nonTableInputsData.length === 0 && answerInputs.length > 0) {
                // Если инпуты есть, но контекст вообще не извлекся - крайний случай
                 console.warn(`   Для блока ${blockId} не удалось извлечь контекст для полей ввода, но они есть. Используем только основной текст вопроса.`);
                 answerInputs.forEach(inputEl => {
                     allInputsForDisplay.push({dataTestId: inputEl.getAttribute('data-test-id'), type: 'input'});
                 });
            }


            if (!tableData && nonTableInputsData.length === 0 && answerInputs.length === 0) {
                console.log(`   Блок ${blockId} не содержит таблиц или полей для ввода. Пропускаем отправку в Gemini.`);
                displayAnswer(block, "(Этот блок не содержит интерактивных элементов для Gemini)", []);
                continue;
            }

            const prompt = buildPrompt(mainQuestionText, tableData, nonTableInputsData);
            const geminiAnswer = await askGemini(prompt);
            displayAnswer(block, geminiAnswer, allInputsForDisplay);

            if (questionCounter < questionBlocks.length) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка между запросами
            }
        }
        console.log('eMaktab Solver: Все вопросы на странице обработаны.');
        solveButton.textContent = '✅ Готово! Решить снова?';
        solveButton.disabled = false;
    }

    // --- Кнопка запуска ---
    const solveButton = document.createElement('button');
    solveButton.textContent = '🔮 Решить с Gemini';
    solveButton.style.position = 'fixed';
    solveButton.style.bottom = '20px';
    solveButton.style.right = '20px';
    solveButton.style.zIndex = '99999';
    solveButton.style.padding = '12px 20px';
    solveButton.style.backgroundColor = '#673ab7'; // Фиолетовый
    solveButton.style.color = 'white';
    solveButton.style.border = 'none';
    solveButton.style.borderRadius = '8px';
    solveButton.style.cursor = 'pointer';
    solveButton.style.fontSize = '16px';
    solveButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    solveButton.id = 'gemini-solve-button';

    solveButton.addEventListener('click', async () => {
        if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
            alert('Пожалуйста, вставьте ваш API ключ Gemini в скрипт!');
            return;
        }
        solveButton.disabled = true;
        solveButton.textContent = '⏳ Загрузка...';
        await processQuestionsOnPage();
    });

    if (!document.getElementById('gemini-solve-button')) {
        document.body.appendChild(solveButton);
    }

})();
