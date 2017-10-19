/*!
 * @license
 * Copyright 2017 Alfresco Software, Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter, Injectable } from '@angular/core';
import { MdDialog } from '@angular/material';
import { Observable, Subject } from 'rxjs/Rx';

import { AlfrescoApiService, AlfrescoContentService, NodesApiService } from 'ng2-alfresco-core';
import { DataColumn } from 'ng2-alfresco-datatable';
import {
    DocumentListService, ContentNodeSelectorComponent,
    ContentNodeSelectorComponentData, ShareDataRow
} from 'ng2-alfresco-documentlist';
import { MinimalNodeEntity, MinimalNodeEntryEntity } from 'alfresco-js-api';

@Injectable()
export class NodeActionsService {
    static SNACK_MESSAGE_DURATION_WITH_UNDO = 10000;
    static SNACK_MESSAGE_DURATION = 3000;

    contentCopied: Subject<MinimalNodeEntity[]> = new Subject<MinimalNodeEntity[]>();
    contentMoved: Subject<any> = new Subject<any>();
    moveDeletedEntries: any[] = [];

    constructor(private contentService: AlfrescoContentService,
                private dialog: MdDialog,
                private documentListService: DocumentListService,
                private apiService: AlfrescoApiService,
                private nodesApi: NodesApiService) {}

    /**
     * Copy node list
     *
     * @param contentEntities nodes to copy
     * @param permission permission which is needed to apply the action
     */
    public copyNodes(contentEntities: any[], permission?: string): Subject<string> {
        return this.doBatchOperation('copy', contentEntities, permission);
    }

    /**
     * Move node list
     *
     * @param contentEntities nodes to move
     * @param permission permission which is needed to apply the action
     */
    public moveNodes(contentEntities: any[], permission?: string): Subject<string> {
        return this.doBatchOperation('move', contentEntities, permission);
    }

    /**
     * General method for performing the given operation (copy|move) to multiple nodes
     *
     * @param action the action to perform (copy|move)
     * @param contentEntities the contentEntities which have to have the action performed on
     * @param permission permission which is needed to apply the action
     */
    doBatchOperation(action: string, contentEntities: any[], permission?: string): Subject<string> {
        const observable: Subject<string> = new Subject<string>();

        if (!this.isEntryEntitiesArray(contentEntities)) {
            observable.error(new Error(JSON.stringify({error: {statusCode: 400}})));

        } else if (this.checkPermission(action, contentEntities, permission)) {

            const destinationSelection = this.getContentNodeSelection(action, contentEntities);
            destinationSelection.subscribe((selections: MinimalNodeEntryEntity[]) => {

                const contentEntry = contentEntities[0].entry ;
                // Check if there's nodeId for Shared Files
                const contentEntryId = contentEntry.nodeId || contentEntry.id;
                const type = contentEntry.isFolder ? 'folder' : 'content';
                const batch = [];

                // consider only first item in the selection
                const selection = selections[0];
                let action$: Observable<any>;

                if (action === 'move' && contentEntities.length === 1 && type === 'content') {
                    action$ = this.documentListService[`${action}Node`].call(this.documentListService, contentEntryId, selection.id);
                    action$ = action$.toArray();

                } else {
                    contentEntities.forEach((node) => {
                        batch.push(this[`${action}NodeAction`](node.entry, selection.id));
                    });
                    action$ = Observable.zip(...batch);
                }

                action$
                    .subscribe(
                        (newContent) => {
                            observable.next(`OPERATION.SUCCES.${type.toUpperCase()}.${action.toUpperCase()}`);

                            if (action === 'copy') {
                                this.contentCopied.next(newContent);

                            } else if (action === 'move') {
                                const processedData = this.processResponse(newContent);
                                this.contentMoved.next(processedData);
                            }

                        },
                        observable.error.bind(observable)
                    );
                this.dialog.closeAll();
            });

        } else {
            observable.error(new Error(JSON.stringify({error: {statusCode: 403}})));
        }

        return observable;
    }

    isEntryEntitiesArray(contentEntities: any[]): boolean {
        if (contentEntities && contentEntities.length) {
            const nonEntryNode = contentEntities.find(node => (!node || !node.entry || !(node.entry.nodeId || node.entry.id)));
            return !nonEntryNode;
        }
        return false;
    }

    checkPermission(action: string, contentEntities: any[], permission?: string) {
        const notAllowedNode = contentEntities.find(node => !this.isActionAllowed(action, node.entry, permission));
        return !notAllowedNode;
    }

    getFirstParentId(nodeEntities: any[]): string {
        for (let i = 0; i < nodeEntities.length; i++) {
            const nodeEntry = nodeEntities[i].entry;

            if (nodeEntry.parentId) {
                return nodeEntry.parentId;

            } else if (nodeEntry.path && nodeEntry.path.elements && nodeEntry.path.elements.length) {
                return nodeEntry.path.elements[nodeEntry.path.elements.length - 1].id;
            }
        }

        // if no parent data is found, return the id of first item / the nodeId in case of Shared Files
        return nodeEntities[0].entry.nodeId || nodeEntities[0].entry.id;
    }

    getEntryParentId(nodeEntry: any) {
        let entryParentId = '';

        if (nodeEntry.parentId) {
            entryParentId = nodeEntry.parentId;

        } else if (nodeEntry.path && nodeEntry.path.elements && nodeEntry.path.elements.length) {
            entryParentId = nodeEntry.path.elements[nodeEntry.path.elements.length - 1].id;
        }

        return entryParentId;
    }

    getContentNodeSelection(action: string, contentEntities: MinimalNodeEntity[]): EventEmitter<MinimalNodeEntryEntity[]> {
        const currentParentFolderId = this.getFirstParentId(contentEntities);

        let nodeEntryName = '';
        if (contentEntities.length === 1 && contentEntities[0].entry.name) {
            nodeEntryName =  `${contentEntities[0].entry.name} `;
        }

        const data: ContentNodeSelectorComponentData = {
            title: `${action} ${nodeEntryName}to ...`,
            currentFolderId: currentParentFolderId,
            rowFilter: this.rowFilter.bind(this),
            imageResolver: this.imageResolver.bind(this),
            select: new EventEmitter<MinimalNodeEntryEntity[]>()
        };

        this.dialog.open(ContentNodeSelectorComponent, {
            data,
            panelClass: 'adf-content-node-selector-dialog',
            width: '630px'
        });

        return data.select;
    }

    copyNodeAction(nodeEntry, selectionId): Observable<any> {
        if (nodeEntry.isFolder) {
            return this.copyFolderAction(nodeEntry, selectionId);

        } else {
            // any other type is treated as 'content'
            return this.copyContentAction(nodeEntry, selectionId);
        }
    }

    copyContentAction(contentEntry, selectionId, oldName?): Observable<any> {
        const _oldName = oldName || contentEntry.name;
        // Check if there's nodeId for Shared Files
        const contentEntryId = contentEntry.nodeId || contentEntry.id;

        // use local method until new name parameter is added on ADF copyNode
        return this.copyNode(contentEntryId, selectionId, _oldName)
            .catch((err) => {
                let errStatusCode;
                try {
                    const {error: {statusCode}} = JSON.parse(err.message);
                    errStatusCode = statusCode;
                } catch (e) { //
                }

                if (errStatusCode && errStatusCode === 409) {
                    return this.copyContentAction(contentEntry, selectionId, this.getNewNameFrom(_oldName, contentEntry.name));
                } else {
                    return Observable.throw(err || 'Server error');
                }
            });
    }

    copyFolderAction(contentEntry, selectionId): Observable<any> {
        // Check if there's nodeId for Shared Files
        const contentEntryId = contentEntry.nodeId || contentEntry.id;
        let $destinationFolder: Observable<any>;
        let $childrenToCopy: Observable<any>;
        let newDestinationFolder;

        return this.copyNode(contentEntryId, selectionId, contentEntry.name)
            .catch((err) => {
                let errStatusCode;
                try {
                    const {error: {statusCode}} = JSON.parse(err.message);
                    errStatusCode = statusCode;
                } catch (e) { //
                }

                if (errStatusCode && errStatusCode === 409) {

                    $destinationFolder = this.getChildByName(selectionId, contentEntry.name);
                    $childrenToCopy = this.getNodeChildren(contentEntryId);

                    return $destinationFolder
                        .flatMap((destination) => {
                            newDestinationFolder = destination;
                            return $childrenToCopy;
                        })
                        .flatMap((nodesToCopy) => {
                            const batch = [];
                            nodesToCopy.list.entries.forEach((node) => {
                                if (node.entry.isFolder) {
                                    batch.push(this.copyFolderAction(node.entry, newDestinationFolder.entry.id));

                                } else {
                                    batch.push(this.copyContentAction(node.entry, newDestinationFolder.entry.id));
                                }
                            });

                            if (!batch.length) {
                                return Observable.of({});
                            }
                            return Observable.zip(...batch);
                        });

                } else {
                    return Observable.throw(err || 'Server error');
                }
            });
    }

    moveNodeAction(nodeEntry, selectionId): Observable<any> {
        this.moveDeletedEntries = [];

        if (nodeEntry.isFolder) {
            const initialParentId = nodeEntry.parentId;

            return this.moveFolderAction(nodeEntry, selectionId)
                .flatMap((newContent) => {

                    // take no extra action, if folder is moved to the same location
                    if (initialParentId === selectionId) {
                        return Observable.of(newContent);
                    }

                    const flattenResponse = this.flatten(newContent);
                    const processedData = this.processResponse(flattenResponse);

                    // else, check if moving this nodeEntry succeeded for ALL of its nodes
                    if (processedData.failed.length === 0) {

                        // check if folder still exists on location
                        return this.getChildByName(initialParentId, nodeEntry.name)
                            .flatMap((folderOnInitialLocation) => {

                                if (folderOnInitialLocation) {
                                    // Check if there's nodeId for Shared Files
                                    const nodeEntryId = nodeEntry.nodeId || nodeEntry.id;
                                    // delete it from location
                                    return this.nodesApi.deleteNode(nodeEntryId)
                                        .flatMap(() => {
                                            this.moveDeletedEntries.push(nodeEntry);
                                            return Observable.of(newContent);
                                        });
                                }
                                return Observable.of(newContent);
                            });

                    }
                    return Observable.of(newContent);
                });

        } else {
            // any other type is treated as 'content'
            return this.moveContentAction(nodeEntry, selectionId);
        }
    }

    moveFolderAction(contentEntry, selectionId): Observable<any> {
        // Check if there's nodeId for Shared Files
        const contentEntryId = contentEntry.nodeId || contentEntry.id;
        const initialParentId = this.getEntryParentId(contentEntry);
        let $destinationFolder: Observable<any>;
        let $childrenToMove: Observable<any>;
        let newDestinationFolder;

        return this.documentListService.moveNode(contentEntryId, selectionId)
            .map((itemMoved) => {
                return { itemMoved, initialParentId };
            })
            .catch((err) => {
                let errStatusCode;
                try {
                    const {error: {statusCode}} = JSON.parse(err.message);
                    errStatusCode = statusCode;
                } catch (e) { //
                }

                if (errStatusCode && errStatusCode === 409) {

                    $destinationFolder = this.getChildByName(selectionId, contentEntry.name);
                    $childrenToMove = this.getNodeChildren(contentEntryId);

                    return $destinationFolder
                        .flatMap((destination) => {
                            newDestinationFolder = destination;
                            return $childrenToMove;
                        })
                        .flatMap((childrenToMove) => {
                            const batch = [];
                            childrenToMove.list.entries.forEach((node) => {
                                if (node.entry.isFolder) {
                                    batch.push(this.moveFolderAction(node.entry, newDestinationFolder.entry.id));

                                } else {
                                    batch.push(this.moveContentAction(node.entry, newDestinationFolder.entry.id));
                                }
                            });

                            if (!batch.length) {
                                return Observable.of(batch);
                            }
                            return Observable.zip(...batch);
                        });
                } else {
                    return Observable.throw(err);
                }
            });
    }

    moveContentAction(contentEntry, selectionId) {
        // Check if there's nodeId for Shared Files
        const contentEntryId = contentEntry.nodeId || contentEntry.id;
        const initialParentId = this.getEntryParentId(contentEntry);

        return this.documentListService.moveNode(contentEntryId, selectionId)
            .map((itemMoved) => {
                return { itemMoved, initialParentId };
            })
            .catch((err) => {
                let errStatusCode;
                try {
                    const {error: {statusCode}} = JSON.parse(err.message);
                    errStatusCode = statusCode;
                } catch (e) { //
                }

                if (errStatusCode && errStatusCode === 409) {
                    // do not throw error, to be able to show message in case of partial move of files
                    return Observable.of(err);
                } else {
                    return Observable.throw(err);
                }
            });
    }

    getChildByName(parentId, name) {
        const matchedNodes: Subject<any> = new Subject<any>();

        this.getNodeChildren(parentId).subscribe(
            (childrenNodes) => {
                const result = childrenNodes.list.entries.find(node => (node.entry.name === name));

                if (result) {
                    matchedNodes.next(result);

                } else {
                    matchedNodes.next(null);
                }
            },
            (err) => {
                return Observable.throw(err || 'Server error');
            });
        return matchedNodes;
    }

    private isActionAllowed(action: string, node: MinimalNodeEntryEntity, permission?: string): boolean {
        if (action === 'copy') {
            return true;
        }
        return this.contentService.hasPermission(node, permission);
    }

    private rowFilter(row: ShareDataRow): boolean {
        const node: MinimalNodeEntryEntity = row.node.entry;
        return (!node.isFile);
    }

    private imageResolver(row: ShareDataRow, col: DataColumn): string | null {
        const entry: MinimalNodeEntryEntity = row.node.entry;
        if (!this.contentService.hasPermission(entry, 'update')) {
            return this.documentListService.getMimeTypeIcon('disable/folder');
        }

        return null;
    }

    public getNewNameFrom(name: string, baseName?: string) {
        const extensionMatch = name.match(/\.[^/.]+$/);

        // remove extension in case there is one
        const fileExtension = extensionMatch ? extensionMatch[0] : '';
        let extensionFree = extensionMatch ? name.slice(0, extensionMatch.index) : name;

        let prefixNumber = 1;
        let baseExtensionFree;

        if (baseName) {
            const baseExtensionMatch = baseName.match(/\.[^/.]+$/);

            // remove extension in case there is one
            baseExtensionFree = baseExtensionMatch ? baseName.slice(0, baseExtensionMatch.index) : baseName;
        }

        if (!baseExtensionFree || baseExtensionFree !== extensionFree) {

            // check if name already has integer appended on end:
            const oldPrefix = extensionFree.match('-[0-9]+$');
            if (oldPrefix) {

                // if so, try to get the number at the end
                const oldPrefixNumber = parseInt(oldPrefix[0].slice(1), 10);
                if (oldPrefixNumber.toString() === oldPrefix[0].slice(1)) {

                    extensionFree = extensionFree.slice(0, oldPrefix.index);
                    prefixNumber = oldPrefixNumber + 1;
                }

            }

        }
        return extensionFree + '-' + prefixNumber + fileExtension;
    }

    /**
     * Get children nodes of given parent node
     *
     * @param nodeId The id of the parent node
     * @param params optional parameters
     */
    getNodeChildren(nodeId: string, params?) {
        return Observable.fromPromise(this.apiService.getInstance().nodes.getNodeChildren(nodeId, params));
    }

    // Copied from ADF document-list.service, and added the name parameter
    /**
     * Copy a node to destination node
     *
     * @param nodeId The id of the node to be copied
     * @param targetParentId The id of the folder-node where the node have to be copied to
     * @param name The new name for the copy that would be added on the destination folder
     */
    copyNode(nodeId: string, targetParentId: string, name?: string) {
        return Observable.fromPromise(this.apiService.getInstance().nodes.copyNode(nodeId, {targetParentId, name}));
    }

    public flatten(nDimArray) {
        if (!Array.isArray(nDimArray)) {
            return nDimArray;
        }

        const nodeQueue = nDimArray.slice(0);
        const resultingArray = [];

        do {
            nodeQueue.forEach(
                (node) => {
                    if (Array.isArray(node)) {
                        nodeQueue.push(...node);
                    } else {
                        resultingArray.push(node);
                    }

                    const nodeIndex = nodeQueue.indexOf(node);
                    nodeQueue.splice(nodeIndex, 1);
                }
            );
        } while (nodeQueue.length);

        return resultingArray;
    }

    processResponse(data: any): any {
        const moveStatus = {
            succeeded: [],
            failed: [],
            partiallySucceeded: []
        };

        if (Array.isArray(data)) {
            return data.reduce(
                (acc, next) => {

                    if (next instanceof Error) {
                        acc.failed.push(next);

                    } else if (Array.isArray(next)) {
                        // if content of a folder was moved

                        const folderMoveResponseData = this.flatten(next);
                        const foundError = folderMoveResponseData.find(node => node instanceof Error);
                        // data might contain also items of form: { itemMoved, initialParentId }
                        const foundEntry = folderMoveResponseData.find(
                            node => (node.itemMoved && node.itemMoved.entry) || (node && node.entry)
                        );

                        if (!foundError) {
                            // consider success if NONE of the items from the folder move response is an error
                            acc.succeeded.push(next);

                        } else if (!foundEntry) {
                            // consider failed if NONE of the items has an entry
                            acc.failed.push(next);

                        } else {
                            // partially move folder
                            acc.partiallySucceeded.push(next);
                        }

                    } else {
                        acc.succeeded.push(next);
                    }

                    return acc;
                },
                moveStatus
            );
        } else {
            if ((data.itemMoved && data.itemMoved.entry) || (data && data.entry)) {
                moveStatus.succeeded.push(data);
            } else {
                moveStatus.failed.push(data);
            }

            return moveStatus;
        }
    }
}
