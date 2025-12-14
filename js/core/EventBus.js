/**
 * @file EventBus.js
 * @description イベント駆動アーキテクチャの基盤
 * @version 1.0.0
 */

class EventBus {
    constructor() {
        this.events = new Map();
        this.debugMode = true; // 本番環境ではfalseに
    }
    
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(handler);
        if (this.debugMode) {
            console.log(`[EventBus] リスナー登録: ${event}`);
        }
        return this;
    }
    
    off(event, handler) {
        if (this.events.has(event)) {
            this.events.get(event).delete(handler);
        }
        return this;
    }
    
    emit(event, data) {
        if (this.debugMode) {
            console.log(`[EventBus] イベント発火: ${event}`, data);
        }
        if (this.events.has(event)) {
            this.events.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[EventBus] ハンドラーエラー (${event}):`, error);
                }
            });
        }
        return this;
    }
    
    getRegisteredEvents() {
        return Array.from(this.events.keys());
    }
}

// グローバルに設定
window.EventBus = EventBus;
window.eventBus = new EventBus();
console.log('EventBus initialized');