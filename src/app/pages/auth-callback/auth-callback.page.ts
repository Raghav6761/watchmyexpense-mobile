import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';

import { AuthService } from '../../services/auth.service';

/**
 * Web-only post-OAuth landing page.
 *
 * The backend redirects to /auth/callback?jwt=... after a successful Google
 * OAuth on web. This component extracts the JWT from the query string, hands
 * it to AuthService.handleWebCallbackJwt(), then navigates the user into the
 * app (Home). On mobile the equivalent role is played by the Capacitor
 * appUrlOpen deep-link listener.
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [IonContent, IonSpinner],
  template: `
    <ion-content [fullscreen]="true">
      <div class="callback-shell">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Signing you in…</p>
      </div>
    </ion-content>
  `,
  styles: [`
    .callback-shell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 12px;
      color: var(--ion-color-medium);
    }
  `]
})
export class AuthCallbackPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  async ngOnInit() {
    // Wait for AuthService to finish loading any persisted state. Avoids a
    // race where we set the new JWT and then init() overwrites it with a
    // stale Preferences read.
    await this.auth.whenReady();

    const jwt = this.route.snapshot.queryParamMap.get('jwt');
    if (jwt) {
      await this.auth.handleWebCallbackJwt(jwt);
    }

    // Strip the JWT from the URL bar (don't want it lingering in history) and
    // bounce the user into the app. Settings is a sensible landing for first
    // sign-in; Home works equally well for returning users.
    this.router.navigate(['/home'], { replaceUrl: true });
  }
}
