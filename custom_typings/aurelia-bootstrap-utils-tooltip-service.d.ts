declare module 'aurelia-bootstrap/utils/tooltip-service' {
    export class TooltipService {
        createAttachment(target: any, element: any, position: string): any;
        setTriggers(element: any, triggers: string[], listeners: any): void;
        removeTriggers(element: any, triggers: string[], listeners: any): void;
    }
}
