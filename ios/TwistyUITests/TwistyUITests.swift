import XCTest

final class TwistyUITests: XCTestCase {
    @MainActor
    func testGameMenusAndSavedSettings() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        let blue = app.buttons["Start with a blue tornado"]
        XCTAssertTrue(blue.waitForExistence(timeout: 35))
        XCTAssertTrue(blue.isHittable)
        screenshot("Home", app)

        app.buttons["Privacy"].tap()
        XCTAssertTrue(app.alerts["Privacy"].waitForExistence(timeout: 5))
        app.alerts.buttons["Done"].tap()

        let quick = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Quick:")).firstMatch
        XCTAssertTrue(quick.isHittable)
        quick.tap()
        if app.buttons["Turn sound off"].exists {
            app.buttons["Turn sound off"].tap()
        }

        blue.tap()
        let pause = app.buttons["Pause game"]
        XCTAssertTrue(pause.waitForExistence(timeout: 15))
        let center = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
        let destination = app.coordinate(withNormalizedOffset: CGVector(dx: 0.68, dy: 0.52))
        center.press(forDuration: 0.08, thenDragTo: destination)
        screenshot("Town", app)

        pause.tap()
        let pauseMenu = app.alerts["Game paused"]
        XCTAssertTrue(pauseMenu.waitForExistence(timeout: 5))
        pauseMenu.buttons["Resume"].tap()
        XCTAssertTrue(pause.isHittable)

        pause.tap()
        XCTAssertTrue(pauseMenu.waitForExistence(timeout: 5))
        pauseMenu.buttons["End this run"].tap()
        XCTAssertTrue(blue.waitForExistence(timeout: 15))
        XCTAssertFalse(pause.exists)
        XCTAssertTrue(app.buttons["Turn sound on"].exists)

        app.terminate()
        app.launch()
        XCTAssertTrue(blue.waitForExistence(timeout: 35))
        XCTAssertTrue(app.buttons["Turn sound on"].exists)
        blue.tap()
        XCTAssertTrue(pause.waitForExistence(timeout: 15))
        // A retained Quick choice starts at 0:45; Normal would show 1:30.
        let quickCountdown = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", ".*0:4[0-5].*")).firstMatch
        XCTAssertTrue(quickCountdown.waitForExistence(timeout: 5))
    }

    @MainActor
    private func screenshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
