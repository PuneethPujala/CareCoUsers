/**
 * aiChatbot.test.js
 * 
 * Unit & Integration tests for the CareMyMed chatbot orchestrator,
 * validating RAG retrieval metrics, Groq primary streaming, Ollama fallback
 * routing, and telemetry logging to AIChatLog.
 */

const axios = require('axios');
const mongoose = require('mongoose');
const { ChromaClient } = require('chromadb');
const { buildPatientContext } = require('../../src/services/aiContextService');
// Mock dependencies
jest.mock('axios');
jest.mock('chromadb');
jest.mock('../../src/services/aiContextService');
jest.mock('../../src/models/AIChatLog', () => {
    return {
        create: jest.fn()
    };
});

const AIChatLog = require('../../src/models/AIChatLog');

const { streamPoCResponse, generatePoCResponse } = require('../../src/services/aiChatbotPoC');

describe('AI Latency Telemetry & Fallback Model Routing', () => {
    let mockRes;
    let mockGetCollection;
    let mockQuery;
    let writeMock;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock SSE Response Object
        writeMock = jest.fn();
        mockRes = {
            write: writeMock,
            on: jest.fn(),
            emit: function(event) {
                if (this.onCloseCallback && event === 'close') {
                    this.onCloseCallback();
                }
            },
            onCloseCallback: null
        };
        // Mock close event registration
        mockRes.on.mockImplementation((event, cb) => {
            if (event === 'close') {
                mockRes.onCloseCallback = cb;
            }
        });

        // Mock ChromaDB Client
        mockQuery = jest.fn().mockResolvedValue({
            distances: [[0.2, 0.4]], // Cosine distance 0.2 -> 0.8 similarity, 0.4 -> 0.6 similarity (0.6 is below 0.75 threshold)
            documents: [["Strict Guideline 1", "Below Threshold Guideline 2"]],
            metadatas: [[{ title: "Strict Match" }, { title: "Weak Match" }]]
        });
        mockGetCollection = jest.fn().mockResolvedValue({
            query: mockQuery
        });
        ChromaClient.prototype.getCollection = mockGetCollection;

        // Mock Patient Context
        buildPatientContext.mockResolvedValue({
            name: "John Doe",
            medications: [],
            today_status: {},
            care_team: { name: "Prakash" },
            latest_interaction: null
        });

        // Mock AIChatLog.create
        AIChatLog.create.mockResolvedValue({});

        // Mock process.env
        process.env.GROQ_API_KEY = 'test-groq-key';
    });

    describe('Emergency Escalation Interceptor', () => {
        it('should trigger emergency bypass without querying LLM', async () => {
            await streamPoCResponse('patient-123', 'I have severe chest pain', 'en', mockRes);

            // Assert that SSE response writes the emergency message
            expect(writeMock).toHaveBeenCalled();
            const calls = writeMock.mock.calls;
            const messages = calls.map(c => JSON.parse(c[0].replace('data: ', '').trim()));

            const chunkMsg = messages.find(m => m.type === 'chunk');
            expect(chunkMsg.text).toContain('urgent medical attention');

            const doneMsg = messages.find(m => m.type === 'done');
            expect(doneMsg).toBeDefined();

            // Asserts that no external LLM was called
            expect(axios.post).not.toHaveBeenCalled();

            // Asserts that AIChatLog is written
            expect(AIChatLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    emergency_escalation_triggered: true,
                    provider: 'esc-emergency',
                    model: 'none',
                    llm_latency_ms: 0
                })
            );
        });
    });

    describe('Groq Primary LLM Stream Flow (Success)', () => {
        it('should stream tokens from Groq and log exact token telemetry', async () => {
            // Mock embedding request
            axios.post.mockImplementation((url, body) => {
                if (url.includes('/api/embeddings')) {
                    return Promise.resolve({
                        data: { embedding: [0.1, 0.2] }
                    });
                }
                // Mock Groq Stream response
                if (url.includes('api.groq.com')) {
                    const mockStream = {
                        on: jest.fn((event, cb) => {
                            if (event === 'data') {
                                // Send content chunks
                                cb(Buffer.from('data: ' + JSON.stringify({
                                    choices: [{ delta: { content: 'Hello patient.' } }]
                                }) + '\n'));
                                cb(Buffer.from('data: ' + JSON.stringify({
                                    choices: [{ delta: { content: '\n>> What should I do next?' } }]
                                }) + '\n'));
                                // Send usage statistics chunk
                                cb(Buffer.from('data: ' + JSON.stringify({
                                    usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 }
                                }) + '\n'));
                                cb(Buffer.from('data: [DONE]\n'));
                            }
                            if (event === 'end') {
                                cb();
                            }
                        })
                    };
                    return Promise.resolve({ data: mockStream });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await streamPoCResponse('patient-123', 'How is my glucose level?', 'en', mockRes);

            // Assertions
            expect(writeMock).toHaveBeenCalled();
            const calls = writeMock.mock.calls;
            const messages = calls.map(c => JSON.parse(c[0].replace('data: ', '').trim()));

            const chunkMsg = messages.find(m => m.type === 'chunk');
            expect(chunkMsg.text).toContain('Hello patient.');

            const suggestionsMsg = messages.find(m => m.type === 'suggestions');
            expect(suggestionsMsg.items).toContain('What should I do next?');

            // Verify AIChatLog telemetry stamp
            expect(AIChatLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'groq',
                    model: 'llama-3.3-70b-versatile',
                    is_fallback: false,
                    prompt_tokens: 15,
                    completion_tokens: 25,
                    total_tokens: 40,
                    retrieved_chunks_count: 1, // Only 1 matched threshold (0.8 >= 0.75)
                    retrieval_similarity_avg: 0.8
                })
            );
        });
    });

    describe('Ollama Fallback Routing Flow', () => {
        it('should fallback to local Ollama on Groq rate limit (429)', async () => {
            // Mock Axios
            let embeddingCalled = false;
            let groqCalled = false;
            let ollamaCalled = false;

            axios.post.mockImplementation((url, body) => {
                if (url.includes('/api/embeddings')) {
                    embeddingCalled = true;
                    return Promise.resolve({
                        data: { embedding: [0.1, 0.2] }
                    });
                }
                if (url.includes('api.groq.com')) {
                    groqCalled = true;
                    const err = new Error('Rate limit exceeded');
                    err.response = { status: 429 };
                    return Promise.reject(err);
                }
                if (url.includes('11434/api/chat')) {
                    ollamaCalled = true;
                    const mockStream = {
                        on: jest.fn((event, cb) => {
                            if (event === 'data') {
                                cb(Buffer.from(JSON.stringify({
                                    message: { content: 'Fallback answer from Ollama.' },
                                    done: false
                                }) + '\n'));
                                cb(Buffer.from(JSON.stringify({
                                    message: { content: '\n>> Ask another' },
                                    done: true
                                }) + '\n'));
                            }
                            if (event === 'end') {
                                cb();
                            }
                        })
                    };
                    return Promise.resolve({ data: mockStream });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await streamPoCResponse('patient-123', 'My blood pressure query', 'en', mockRes);

            expect(groqCalled).toBe(true);
            expect(ollamaCalled).toBe(true);

            const calls = writeMock.mock.calls;
            const messages = calls.map(c => JSON.parse(c[0].replace('data: ', '').trim()));
            const chunkMsg = messages.find(m => m.type === 'chunk');
            expect(chunkMsg.text).toContain('Fallback answer from Ollama.');

            // Verify AIChatLog fallback stamps
            expect(AIChatLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'ollama',
                    model: 'llama3:8b',
                    is_fallback: true,
                    fallback_reason: 'rate_limit',
                    retrieved_chunks_count: 1
                })
            );
        });

        it('should fallback to local Ollama on Groq timeout', async () => {
            axios.post.mockImplementation((url, body) => {
                if (url.includes('/api/embeddings')) {
                    return Promise.resolve({
                        data: { embedding: [0.1, 0.2] }
                    });
                }
                if (url.includes('api.groq.com')) {
                    const err = new Error('timeout of 15000ms exceeded');
                    err.code = 'ECONNABORTED';
                    return Promise.reject(err);
                }
                if (url.includes('11434/api/chat')) {
                    const mockStream = {
                        on: jest.fn((event, cb) => {
                            if (event === 'data') {
                                cb(Buffer.from(JSON.stringify({
                                    message: { content: 'Ollama answer' },
                                    done: true
                                }) + '\n'));
                            }
                            if (event === 'end') {
                                cb();
                            }
                        })
                    };
                    return Promise.resolve({ data: mockStream });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            await streamPoCResponse('patient-123', 'BP test', 'en', mockRes);

            expect(AIChatLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'ollama',
                    is_fallback: true,
                    fallback_reason: 'timeout'
                })
            );
        });
    });

    describe('Client Connection Interruption Socket Cleanup', () => {
        it('should abort active Axios stream requests when client disconnects', async () => {
            const mockAbort = jest.fn();
            let abortListener = null;
            global.AbortController = jest.fn().mockImplementation(() => {
                const signal = {
                    aborted: false,
                    addEventListener: jest.fn((event, cb) => {
                        if (event === 'abort') {
                            abortListener = cb;
                        }
                    }),
                    removeEventListener: jest.fn((event, cb) => {
                        if (event === 'abort') {
                            abortListener = null;
                        }
                    })
                };
                return {
                    signal,
                    abort: () => {
                        signal.aborted = true;
                        mockAbort();
                        if (abortListener) {
                            abortListener();
                        }
                    }
                };
            });

            // Mock embedding
            axios.post.mockImplementation((url, body) => {
                if (url.includes('/api/embeddings')) {
                    return Promise.resolve({
                        data: { embedding: [0.1, 0.2] }
                    });
                }
                if (url.includes('api.groq.com')) {
                    // Stream that doesn't end immediately, allowing client to close
                    const mockStream = {
                        on: jest.fn((event, cb) => {
                            if (event === 'data') {
                                cb(Buffer.from('data: ' + JSON.stringify({
                                    choices: [{ delta: { content: 'Partially generated content.' } }]
                                }) + '\n'));
                            }
                        })
                    };
                    return Promise.resolve({ data: mockStream });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            // Trigger stream
            const streamPromise = streamPoCResponse('patient-123', 'Delayed query', 'en', mockRes);

            // Emit close event on client connection mid-stream
            mockRes.emit('close');

            await streamPromise;

            // Verify AbortController was called to terminate Axios calls
            expect(mockAbort).toHaveBeenCalled();
        });
    });

    describe('generatePoCResponse (Non-streaming Fallback Path)', () => {
        it('should use Groq as primary and record non-streaming logs', async () => {
            axios.post.mockImplementation((url, body) => {
                if (url.includes('/api/embeddings')) {
                    return Promise.resolve({
                        data: { embedding: [0.1, 0.2] }
                    });
                }
                if (url.includes('api.groq.com')) {
                    return Promise.resolve({
                        data: {
                            choices: [{ message: { content: 'Non-streaming answer\n>> Question?' } }],
                            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
                        }
                    });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const result = await generatePoCResponse('patient-123', 'BP level', 'en');

            expect(result.success).toBe(true);
            expect(result.response).toBe('Non-streaming answer');
            expect(result.suggestions).toContain('Question?');

            expect(AIChatLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'groq',
                    is_fallback: false,
                    prompt_tokens: 10,
                    completion_tokens: 20,
                    total_tokens: 30
                })
            );
        });

        it('should fallback to Ollama if Groq fails in non-streaming mode', async () => {
            axios.post.mockImplementation((url, body) => {
                if (url.includes('/api/embeddings')) {
                    return Promise.resolve({
                        data: { embedding: [0.1, 0.2] }
                    });
                }
                if (url.includes('api.groq.com')) {
                    const err = new Error('Service Unavailable');
                    err.response = { status: 503 };
                    return Promise.reject(err);
                }
                if (url.includes('11434/api/chat')) {
                    return Promise.resolve({
                        data: {
                            message: { content: 'Non-streaming fallback from Ollama' }
                        }
                    });
                }
                return Promise.reject(new Error('Unexpected URL'));
            });

            const result = await generatePoCResponse('patient-123', 'BP level fallback', 'en');

            expect(result.success).toBe(true);
            expect(result.response).toBe('Non-streaming fallback from Ollama');

            expect(AIChatLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'ollama',
                    is_fallback: true,
                    fallback_reason: 'provider_unavailable'
                })
            );
        });
    });
});
