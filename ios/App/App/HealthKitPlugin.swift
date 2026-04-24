import Capacitor
import HealthKit

// NOTE: After adding this file to the Xcode project, also enable the HealthKit
// capability: App target → Signing & Capabilities → "+" → HealthKit.

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryQuantity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "querySleep", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // MARK: - isAvailable

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    // MARK: - requestPermissions

    @objc func requestPermissions(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false]); return
        }
        let readIds = (call.getArray("read", String.self) ?? []).compactMap { HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: $0)) as HKObjectType? }
        let writeIds = (call.getArray("write", String.self) ?? []).compactMap { HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: $0)) as HKSampleType? }
        let readSet = Set(readIds + [HKObjectType.workoutType(), HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!])
        store.requestAuthorization(toShare: Set(writeIds), read: readSet) { ok, _ in
            call.resolve(["granted": ok])
        }
    }

    // MARK: - queryWorkouts

    @objc func queryWorkouts(_ call: CAPPluginCall) {
        guard let start = parseDate(call.getString("startDate")),
              let end   = parseDate(call.getString("endDate")) else {
            call.resolve(["workouts": []]); return
        }
        let pred  = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort  = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let limit = call.getInt("limit") ?? 200
        let q = HKSampleQuery(sampleType: .workoutType(), predicate: pred, limit: limit, sortDescriptors: [sort]) { [weak self] _, samples, _ in
            guard let self else { call.resolve(["workouts": []]); return }
            let result = (samples as? [HKWorkout] ?? []).map { self.encodeWorkout($0) }
            call.resolve(["workouts": result])
        }
        store.execute(q)
    }

    // MARK: - queryQuantity

    @objc func queryQuantity(_ call: CAPPluginCall) {
        guard let typeId = call.getString("type"),
              let qType  = HKQuantityType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: typeId)),
              let start  = parseDate(call.getString("startDate")),
              let end    = parseDate(call.getString("endDate")) else {
            call.resolve(["samples": []]); return
        }
        let pred  = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort  = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let limit = call.getInt("limit") ?? 500
        let unit  = preferredUnit(for: typeId)
        let q = HKSampleQuery(sampleType: qType, predicate: pred, limit: limit, sortDescriptors: [sort]) { [weak self] _, samples, _ in
            guard let self else { call.resolve(["samples": []]); return }
            let result = (samples as? [HKQuantitySample] ?? []).map { s -> [String: Any] in
                ["startDate": self.iso8601.string(from: s.startDate),
                 "endDate":   self.iso8601.string(from: s.endDate),
                 "value":     s.quantity.doubleValue(for: unit)]
            }
            call.resolve(["samples": result])
        }
        store.execute(q)
    }

    // MARK: - querySleep

    @objc func querySleep(_ call: CAPPluginCall) {
        guard let catType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
              let start   = parseDate(call.getString("startDate")),
              let end     = parseDate(call.getString("endDate")) else {
            call.resolve(["samples": []]); return
        }
        let pred  = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort  = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let limit = call.getInt("limit") ?? 500
        let q = HKSampleQuery(sampleType: catType, predicate: pred, limit: limit, sortDescriptors: [sort]) { [weak self] _, samples, _ in
            guard let self else { call.resolve(["samples": []]); return }
            let result = (samples as? [HKCategorySample] ?? []).map { s -> [String: Any] in
                let state: String
                switch HKCategoryValueSleepAnalysis(rawValue: s.value) {
                case .inBed:           state = "inBed"
                case .asleepCore:      state = "core"
                case .asleepDeep:      state = "deep"
                case .asleepREM:       state = "rem"
                case .awake:           state = "awake"
                default:               state = "asleep"
                }
                return ["startDate": self.iso8601.string(from: s.startDate),
                        "endDate":   self.iso8601.string(from: s.endDate),
                        "duration":  s.endDate.timeIntervalSince(s.startDate),
                        "value":     state]
            }
            call.resolve(["samples": result])
        }
        store.execute(q)
    }

    // MARK: - Helpers

    private func parseDate(_ str: String?) -> Date? {
        guard let str else { return nil }
        return iso8601.date(from: str) ?? ISO8601DateFormatter().date(from: str)
    }

    private func preferredUnit(for typeId: String) -> HKUnit {
        switch typeId {
        case "HKQuantityTypeIdentifierBodyMass":                  return .gramUnit(with: .kilo)
        case "HKQuantityTypeIdentifierActiveEnergyBurned",
             "HKQuantityTypeIdentifierBasalEnergyBurned":         return .kilocalorie()
        case "HKQuantityTypeIdentifierDistanceWalkingRunning",
             "HKQuantityTypeIdentifierDistanceCycling":           return .meter()
        case "HKQuantityTypeIdentifierStepCount":                  return .count()
        default:                                                   return HKUnit(from: "count/min") // bpm
        }
    }

    private func encodeWorkout(_ w: HKWorkout) -> [String: Any] {
        var result: [String: Any] = [
            "workoutActivityName": w.workoutActivityType.name,
            "workoutActivityId":   w.workoutActivityType.rawValue,
            "startDate":           iso8601.string(from: w.startDate),
            "endDate":             iso8601.string(from: w.endDate),
            "duration":            w.duration,
            "totalEnergyBurned":   w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0,
            "totalDistance":       w.totalDistance?.doubleValue(for: .meter()) ?? 0,
        ]
        return result
    }
}

// Map HKWorkoutActivityType to a readable name
extension HKWorkoutActivityType {
    var name: String {
        switch self {
        case .rowing:          return "Rowing"
        case .rowing:          return "Rowing"
        case .cycling:         return "Cycling"
        case .running:         return "Running"
        case .walking:         return "Walking"
        case .swimming:        return "Swimming"
        case .yoga:            return "Yoga"
        case .strengthTraining: return "Strength Training"
        case .crossTraining:   return "Cross Training"
        case .hiking:          return "Hiking"
        default:               return "Workout"
        }
    }
}
