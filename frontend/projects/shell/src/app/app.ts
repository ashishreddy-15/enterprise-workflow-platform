import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent {
  auth = inject(AuthService);

  onPersonaChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const persona = this.auth.personas.find(p => p.id === select.value);
    if (persona) {
      this.auth.switchPersona(persona);
    }
  }
}
