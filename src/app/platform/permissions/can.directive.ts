import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { PermissionsService } from './permissions.service';

@Directive({
  selector: '[peraCan]',
  standalone: true,
})
export class CanDirective {
  @Input('peraCan') permission!: string | string[];

  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionsService);
  private rendered = false;

  constructor() {
    effect(() => {
      const hasAccess = this.permissions.can(this.permission);

      if (hasAccess && !this.rendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.rendered = true;
      } else if (!hasAccess && this.rendered) {
        this.viewContainer.clear();
        this.rendered = false;
      }
    });
  }
}
