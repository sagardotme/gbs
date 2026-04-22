import * as Tether from 'tether';

export class ViewportTooltipService {
    createAttachment(target, element, position) {
        let attachment;
        let targetAttachment;

        if (position === 'top') {
            attachment = 'bottom center';
            targetAttachment = 'top center';
        } else if (position === 'bottom') {
            attachment = 'top center';
            targetAttachment = 'bottom center';
        } else if (position === 'left') {
            attachment = 'center right';
            targetAttachment = 'center left';
        } else {
            attachment = 'center left';
            targetAttachment = 'center right';
        }

        return new (Tether as any)({
            element: element,
            target: target,
            attachment: attachment,
            targetAttachment: targetAttachment,
            constraints: [
                {
                    to: 'window',
                    attachment: 'together',
                    pin: true
                }
            ]
        });
    }

    setTriggers(element, triggers, listeners) {
        if (!triggers.includes('none')) {
            if (triggers.includes('mouseover')) {
                element.addEventListener('mouseover', listeners.in);
                element.addEventListener('mouseleave', listeners.out);
            }

            if (triggers.includes('focus')) {
                element.addEventListener('focus', listeners.in);
                element.addEventListener('blur', listeners.out);
            }

            if (triggers.includes('click')) {
                element.addEventListener('click', listeners.click);
            } else if (triggers.includes('outsideClick')) {
                element.addEventListener('click', listeners.in);
                listeners.viewportOutside = event => {
                    if (element === event.target || (element.contains && element.contains(event.target))) {
                        return;
                    }
                    listeners.outside(event);
                };
                document.addEventListener('click', listeners.viewportOutside);
            }
        }
    }

    removeTriggers(element, triggers, listeners) {
        if (!triggers.includes('none')) {
            if (triggers.includes('mouseover')) {
                element.removeEventListener('mouseover', listeners.in);
                element.removeEventListener('mouseleave', listeners.out);
            }

            if (triggers.includes('focus')) {
                element.removeEventListener('focus', listeners.in);
                element.removeEventListener('blur', listeners.out);
            }

            if (triggers.includes('click')) {
                element.removeEventListener('click', listeners.click);
            } else if (triggers.includes('outsideClick')) {
                element.removeEventListener('click', listeners.in);
                document.removeEventListener('click', listeners.viewportOutside || listeners.outside);
                delete listeners.viewportOutside;
            }
        }
    }
}
