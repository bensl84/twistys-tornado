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

        let short = app.switches
            .matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Short")).firstMatch
        XCTAssertTrue(short.waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(short.isHittable, app.debugDescription)
        short.tap()
        let mute = app.switches["Turn sound off"]
        let unmute = app.switches["Turn sound on"]
        if mute.exists {
            mute.tap()
        }
        XCTAssertTrue(unmute.waitForExistence(timeout: 5), app.debugDescription)

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
        XCTAssertTrue(unmute.waitForExistence(timeout: 5), app.debugDescription)

        app.terminate()
        app.launch()
        XCTAssertTrue(blue.waitForExistence(timeout: 35))
        XCTAssertTrue(unmute.waitForExistence(timeout: 5), app.debugDescription)
        blue.tap()
        XCTAssertTrue(pause.waitForExistence(timeout: 15))
        // A retained Short choice starts at 0:45.
        let shortCountdown = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", ".*0:4[0-5].*")).firstMatch
        XCTAssertTrue(shortCountdown.waitForExistence(timeout: 5), app.debugDescription)
    }

    @MainActor
    func testReturnsToStartFromCompletedShortRun() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()

        let blue = app.buttons["Start with a blue tornado"]
        XCTAssertTrue(blue.waitForExistence(timeout: 35))
        let short = app.switches
            .matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Short")).firstMatch
        XCTAssertTrue(short.waitForExistence(timeout: 8))
        short.tap()
        blue.tap()

        let backToStart = app.buttons["Back to start"]
        XCTAssertTrue(backToStart.waitForExistence(timeout: 240))
        XCTAssertTrue(backToStart.isHittable)
        screenshot("Completed Short Run", app)
        backToStart.tap()

        XCTAssertTrue(blue.waitForExistence(timeout: 25))
        XCTAssertFalse(app.buttons["Pause game"].exists)
        XCTAssertTrue(app.staticTexts["Up to 3 min for the full run"].exists)
    }

    @MainActor
    private func screenshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
