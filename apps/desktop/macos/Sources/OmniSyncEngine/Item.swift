import FileProvider
import OmniSyncCore
@preconcurrency import StorageSync
import UniformTypeIdentifiers

/// One thing in Finder: a made-up level (a workspace's folder, `My files`, `Shared`) or a
/// Storage node. Everything it says comes from the server's answer, never from a guess.
public final class Item: NSObject, NSFileProviderItem {
    public let id: ItemID
    public let node: StorageNode?
    private let name: String
    private let parent: ItemID

    /// A Storage node, where it sits now.
    public init(node: StorageNode) {
        id = .node(orgId: node.orgId, nodeId: node.id)
        self.node = node
        name = node.name
        parent = ItemID.parent(of: node)
    }

    /// The domain's root: the system asks for it before anything else.
    public init(rootNamed name: String) {
        id = .root
        node = nil
        self.name = name
        parent = .root
    }

    /// A synced workspace's folder at the root, named after the workspace.
    public init(workspace: StorageSyncWorkspace) {
        id = .workspace(orgId: workspace.orgId)
        node = nil
        name = workspace.name
        parent = .root
    }

    /// `My files` or `Shared` inside a workspace's folder.
    public init(orgId: String, space: Space) {
        id = .space(orgId: orgId, space: space)
        node = nil
        name = space == .personal ? "My files" : "Shared"
        parent = .workspace(orgId: orgId)
    }

    public var itemIdentifier: NSFileProviderItemIdentifier { id.identifier }
    public var parentItemIdentifier: NSFileProviderItemIdentifier { parent.identifier }
    public var filename: String { name }
    public var capabilities: NSFileProviderItemCapabilities { OmniSyncCore.capabilities(of: id, node: node) }
    public var itemVersion: NSFileProviderItemVersion { node.map(OmniSyncCore.itemVersion(of:)) ?? fixedItemVersion }

    public var contentType: UTType {
        guard let node, node.kind == .file else { return .folder }
        return UTType(filenameExtension: (node.name as NSString).pathExtension)
            ?? node.mimeType.flatMap { UTType(mimeType: $0) }
            ?? .data
    }

    public var documentSize: NSNumber? { node.map { NSNumber(value: $0.size) } }
    public var creationDate: Date? { node.flatMap { Self.date($0.createdAt) } }
    public var contentModificationDate: Date? { node.flatMap { Self.date($0.updatedAt) } }

    private static func date(_ iso: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }
}
