//此自定義元素取自[巧用两个type=range input实现区域范围选择](https://www.zhangxinxu.com/study/202102/two-range-input-demo.php),由我本人修改而成
class uiRange extends HTMLElement {
    constructor () {
        super();
    }
    static get style () {
        return `<style>
            :host {
                --ui-range-track-height: 4px;
                --ui-range-thumb-size: 16px;
                --ui-gray:rgb(158, 176, 211);
                --ui-blue: #2a80eb;
                display: inline-block;
                position: relative;
            }
            :host([multiple]) {
                pointer-events: none;
            }
            [type="range"] {
                display: block;
                -webkit-appearance: none;
                appearance: none;
                margin: 0;
                outline: 0;
                background: none;
                width: -webkit-fill-available;
                width: fill-available;
                width: fill;
            }
            [type="range"] + [type="range"] {
                position: absolute;
                left: 0; top: 0; bottom: 0;
                margin: auto;
            }
            [type="range"]::-webkit-slider-runnable-track {
                display: flex;
                align-items: center;
                height: var(--ui-range-track-hegiht);
                border-radius: var(--ui-range-track-hegiht);
                background: linear-gradient(to right, var(--ui-gray) calc(1% * var(--from, 0)), var(--ui-blue) calc(1% * var(--from, 0)) calc(1% * var(--to, 100)), var(--ui-gray) 0%);
            }
            [type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                pointer-events: auto;
                width: var(--ui-range-thumb-size);
                height: var(--ui-range-thumb-size);
                border-radius: 50%;
                background-color: #fff;
                box-shadow: 0 1px 3px 1px rgba(0, 0, 0, .25);
                transition: border-color .15s, background-color .15s;
                cursor: pointer;
                margin-top: calc((var(--ui-range-thumb-size) - var(--ui-range-track-hegiht)) * -0.5);
            }
            [type="range"]::-webkit-slider-thumb:active {
                background-color: var(--ui-light,#f7f9fa);
                box-shadow: 0 0 1px 1px rgba(0, 0, 0, .25);
            }
            [type="range"] + [type="range"]::-webkit-slider-runnable-track {
                background: none;
            }
            /* Firefox */
            [type="range"] {
                width: -moz-available;
            }
            input[type=range]::-moz-range-track {
                display: flex;
                align-items: center;
                height: var(--ui-range-track-hegiht);
                border-radius: var(--ui-range-track-hegiht);
                background: linear-gradient(to right, var(--ui-gray) calc(1% * var(--from, 0)), var(--ui-blue) calc(1% * var(--from, 0)) calc(1% * var(--to, 100)), var(--ui-gray) 0%);
            }
            input[type=range]::-moz-range-thumb {
                -webkit-appearance: none;
                appearance: none;
                pointer-events: auto;
                width: var(--ui-range-thumb-size);
                height: var(--ui-range-thumb-size);
                border-radius: 50%;
                background-color: #fff;
                box-shadow: 0 1px 3px 1px rgba(0, 0, 0, .25);
                transition: border-color .15s, background-color .15s;
                cursor: pointer;
                margin-top: calc((var(--ui-range-thumb-size) - var(--ui-range-track-hegiht)) * -0.5);
            }
            [type="range"]::-moz-range-thumb:active {
                background-color: var(--ui-light,#f7f9fa);
                box-shadow: 0 0 1px 1px rgba(0, 0, 0, .25);
            }
            [type="range"] + [type="range"]::-moz-range-track {
                background: none;
            }
            </style>
        `;
    }
    static get observedAttributes () {
        return ['max', 'min', 'step', 'value'];
    }

    get value () {
        return this.getAttribute('value');
    }
    set value (val) {
        this.setAttribute('value', val);
    }
    get min () {
        return this.getAttribute('min') || '0';
    }
    set min (val) {
        this.setAttribute('min', val);
    }
    get max () {
        return this.getAttribute('max') || '100';
    }
    set max (val) {
        this.setAttribute('max', val);
    }
    get step () {
        return this.getAttribute('step') || '1';
    }
    set step (val) {
        this.setAttribute('step', val);
    }

    get multiple () {
        return this.hasAttribute('multiple');
    }
    set multiple (val) {
        this.toggleAttribute('multiple', val);
    }

    connectedCallback () {
        this.create();
    }
    attributeChangedCallback (name, oldValue, newValue) {
        this.render(name, oldValue, newValue);
    }
    create () {
        // Shadow DOM元素
        let shadow = this.attachShadow({
            mode: 'open'
        });

        // 样式
        shadow.innerHTML = uiRange.style;

        // 赋值处理
        let value = this.value || '';
        let arrValue = value.split(/,\s*|\s+/);

        if (this.multiple && arrValue.length === 1) {
            arrValue[1] = arrValue[0];
        }
        arrValue.forEach((val, index) => {
            let range = document.createElement('input');
            range.type = 'range';
            // 默认属性
            ['max', 'min', 'step'].forEach(attr => {
                if (this.hasAttribute(attr)) {
                    range[attr] = this[attr];
                }
            });
            // 赋值处理
            if (val) {
                range.value = val;
            }

            // 事件处理
            range.addEventListener('input', (event) => {
                this.dispatchEvent(new CustomEvent('input'));
            });

            // 放在Shadow DOM中
            shadow.append(range);
            // 暴露给自定义元素
            this['range' + index] = range;
        });
        this.datalist = null;
        if (this.range0 || this.range1) {
            if (this.datalist) {
                this.datalist.remove();
            }
            this.datalist = document.createElement('datalist');
            this.datalist.id = `${this.className}-ui-range-datalist`;
            let options = [];
            let step = parseFloat(this.step);
            let minValue = parseFloat(this.min);
            let maxValue = parseFloat(this.max);
            for (let i = minValue; Math.round(i * 100)/100 <= maxValue; i += step) {
                options.push(Math.round(i * 100)/100); // 保留一位小数
            }
            options.forEach(option => {
                let optionElement = document.createElement('option');
                optionElement.value = option;
                optionElement.label = option;
                this.datalist.appendChild(optionElement);
            });
            // 添加到Shadow DOM
            if (this.shadowRoot) {
                let shadow = this.shadowRoot;
                console.log('shadowRoot', shadow);
                shadow.appendChild(this.datalist);
            } else {
                this.appendChild(datalist);
            }
            if (this.range0) {
                this.range0.setAttribute('list', this.datalist.id);
            }
            if (this.range1) {
                this.range1.setAttribute('list', this.datalist.id);
            }
        }
        
        // 事件
        this.events();
    }

    events () {
        this.addEventListener('input', _ => {
            // value值变化
            let value0 = this.range0.valueAsNumber;
            if (this.multiple) {
                let value1 = this.range1.valueAsNumber;
                this.value = [value0, value1].map(val => {
                    return Number(val);
                }).sort(function (a, b) {
                    return a - b;
                }).join();
            }else {
                this.value = value0;
            }
        });
    }

    render (name, oldValue, newValue) {
        let value = this.value;
        let arrValue = value.split(/,\s*|\s+/);
        arrValue=arrValue.map(x => {return Number(x)});
        // 百分比值确定
        let min = this.min;
        let max = this.max;
        let distance = max - min;
        let from = 0;
        let to = 100;
        let r0 = null;
        let r1 = null;
        if (this.range0) {
            r0 = this.range0;
        }
        if (this.range1) {
            r1 = this.range1;
        }
        if (newValue !== oldValue && newValue != (r1 ? [r0.valueAsNumber,r1.valueAsNumber].join() : r0 ? r0.valueAsNumber : '')) {
            if (r0) {
                r0.min = min;
                r0.max = max;
                r0.step = this.step;
            }
            if (this.multiple) {
                if (r1) {
                    r1.min = min;
                    r1.max = max;
                    r1.step = this.step;
                    if (r0.valueAsNumber < r1.valueAsNumber) {
                        r0.valueAsNumber = Math.max(Math.min(arrValue[0], max), min);
                        r1.valueAsNumber = Math.max(Math.min(arrValue[1], max), min);
                    }else{
                        r0.valueAsNumber = Math.max(Math.min(arrValue[1], max), min);
                        r1.valueAsNumber = Math.max(Math.min(arrValue[0], max), min);
                    }
                }
            }else {
                r0.valueAsNumber = Math.max(Math.min(arrValue[0], max), min);
            }
        }

        if (this.multiple) {
            from = 100 * (arrValue[0] - min) / distance;            
        }
        to = 100 * ((arrValue[1]) - min) / distance;

        this.style.setProperty('--from', from);
        this.style.setProperty('--to', to);
        if (name == 'max' || name == 'min' || name == 'step' || !this.datalist) {
            // 重新设置样式
            if (r0 || r1) {
                if (this.datalist) {
                    this.datalist.remove();
                }
                this.datalist = document.createElement('datalist');
                this.datalist.id = `${this.className}-ui-range-datalist`;
                let options = [];
                let step = parseFloat(this.step);
                let minValue = parseFloat(this.min);
                let maxValue = parseFloat(this.max);
                for (let i = minValue; i <= maxValue; i += step) {
                    options.push(i);
                }
                options.forEach(option => {
                    let optionElement = document.createElement('option');
                    optionElement.value = option;
                    optionElement.label = option;
                    this.datalist.appendChild(optionElement);
                });
                // 添加到Shadow DOM
                if (this.shadowRoot) {
                    let shadow = this.shadowRoot;
                    console.log('shadowRoot', shadow);
                    shadow.appendChild(this.datalist);
                } else {
                    this.appendChild(datalist);
                }
                if (r0) {
                    r0.setAttribute('list', this.datalist.id);
                }
                if (r1) {
                    r1.setAttribute('list', this.datalist.id);
                }
            }
        }
    }
}
if (!customElements.get('ui-range')) {
    customElements.define('ui-range', uiRange);
}