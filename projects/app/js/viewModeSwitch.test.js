import { describe, test, expect, vi, beforeEach } from 'vitest';
import { initViewModeSwitch, setViewModeSwitchState } from './viewModeSwitch.js';

// DOM の簡易モッククラス
class MockElement {
  constructor(tagName = 'div', classes = []) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.classListSet = new Set(classes);
    this.eventListeners = new Map();
    this.children = [];

    this.classList = {
      add: (c) => this.classListSet.add(c),
      remove: (c) => this.classListSet.delete(c),
      contains: (c) => this.classListSet.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classListSet.has(c)) this.classListSet.delete(c);
          else this.classListSet.add(c);
        } else if (force) {
          this.classListSet.add(c);
        } else {
          this.classListSet.delete(c);
        }
      },
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  querySelector(selector) {
    if (selector === '.vms-track') {
      return this.children.find((child) => child.classList.contains('vms-track')) || null;
    }
    return null;
  }

  // テスト用ヘルパー: イベント発火
  click() {
    const listeners = this.eventListeners.get('click') || [];
    listeners.forEach((fn) => fn());
  }

  keydown(key) {
    const listeners = this.eventListeners.get('keydown') || [];
    const event = {
      key,
      preventDefault: vi.fn(),
    };
    listeners.forEach((fn) => fn(event));
    return event;
  }
}

describe('viewModeSwitch', () => {
  let switchEl;
  let trackEl;

  beforeEach(() => {
    vi.useFakeTimers();
    switchEl = new MockElement('div', ['view-mode-switch']);
    trackEl = new MockElement('div', ['vms-track']);
    switchEl.children.push(trackEl);
  });

  test('初期モードが sidepanel のとき aria-checked="true" かつ .vms-track--sidepanel クラスが付与される', () => {
    const onChange = vi.fn();
    initViewModeSwitch(switchEl, 'sidepanel', onChange);

    expect(switchEl.getAttribute('aria-checked')).toBe('true');
    expect(trackEl.classList.contains('vms-track--sidepanel')).toBe(true);
    expect(trackEl.classList.contains('vms-track--tab')).toBe(false);
  });

  test('初期モードが tab のとき aria-checked="false" かつ .vms-track--tab クラスが付与される', () => {
    const onChange = vi.fn();
    initViewModeSwitch(switchEl, 'tab', onChange);

    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    expect(trackEl.classList.contains('vms-track--tab')).toBe(true);
    expect(trackEl.classList.contains('vms-track--sidepanel')).toBe(false);
  });

  test('クリック操作でモードが切り替わり onChange コールバックが正しく呼ばれる', () => {
    const onChange = vi.fn();
    initViewModeSwitch(switchEl, 'sidepanel', onChange);

    // sidepanel -> tab
    switchEl.click();
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    expect(onChange).toHaveBeenLastCalledWith('tab');

    // tab -> sidepanel
    switchEl.click();
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith('sidepanel');
  });

  test('Space / Enter キー操作でモードが切り替わり preventDefault が実行される', () => {
    const onChange = vi.fn();
    initViewModeSwitch(switchEl, 'sidepanel', onChange);

    // Space キー
    const spaceEvent = switchEl.keydown(' ');
    expect(spaceEvent.preventDefault).toHaveBeenCalled();
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    expect(onChange).toHaveBeenLastCalledWith('tab');

    // Enter キー
    const enterEvent = switchEl.keydown('Enter');
    expect(enterEvent.preventDefault).toHaveBeenCalled();
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith('sidepanel');
  });

  test('setViewModeSwitchState で表示状態のみが更新され 100ms 後に animating クラスが除去される', () => {
    setViewModeSwitchState(switchEl, 'tab');

    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    expect(trackEl.classList.contains('vms-track--animating')).toBe(true);

    vi.advanceTimersByTime(100);
    expect(trackEl.classList.contains('vms-track--animating')).toBe(false);
  });
});
