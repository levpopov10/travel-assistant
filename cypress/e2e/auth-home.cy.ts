describe('Auth to Home flow', () => {
  it('logs in and redirects to home', () => {
    cy.intercept('POST', '**/api/auth/login', {
      statusCode: 200,
      body: {
        token: 'test-token',
        user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' },
      },
    }).as('login');

    cy.intercept('GET', '**/api/users/*/search-history', {
      statusCode: 200,
      body: { history: [] },
    }).as('history');

    cy.visit('/auth');
    cy.contains('Account').should('be.visible');

    cy.get('ion-segment-button[value="login"]').click();
    cy.contains('Login or Email').closest('ion-item').find('input').type('tester@example.com');
    cy.contains('Password').closest('ion-item').find('input').type('password123');
    cy.contains('Sign in').click();

    cy.wait('@login');
    cy.url().should('include', '/home');
    cy.contains('Hi, Tester').should('be.visible');
  });
});

